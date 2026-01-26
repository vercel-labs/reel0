import { generateText, Output } from "ai";
import { z } from "zod";

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export interface IdentifiedClip {
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  hook: string;
  transcript: string;
}

export interface ClipIdentificationResult {
  clips: IdentifiedClip[];
}

/**
 * Extracts transcript text from segments that overlap with a time range.
 */
function getTranscriptForTimeRange(
  segments: TranscriptSegment[],
  startTime: number,
  endTime: number
): string {
  return segments
    .filter((seg) => {
      // Include segment if it overlaps with the time range
      return seg.end > startTime && seg.start < endTime;
    })
    .map((seg) => seg.text)
    .join(" ");
}

/**
 * Identifies clips from a transcript based on a user prompt.
 * @param transcript - The full transcript text.
 * @param segments - Transcript segments with timestamps.
 * @param prompt - User's prompt describing what clips to find.
 * @param clipCount - Number of clips to identify.
 * @param clipDuration - Target duration for each clip in seconds.
 */
export async function identifyClips(
  transcript: string,
  segments: TranscriptSegment[],
  prompt: string,
  clipCount: number,
  clipDuration: number
): Promise<ClipIdentificationResult> {
  const segmentsWithTimestamps = segments
    .map((seg) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s] ${seg.text}`)
    .join("\n");

  const { output } = await generateText({
    model: "openai/gpt-4.1",
    output: Output.object({
      schema: z.object({
        clips: z.array(
          z.object({
            title: z.string().describe("A catchy title for this clip"),
            reason: z.string().describe("Why this clip matches the criteria"),
            startTime: z.number().describe("Start time in seconds - must match a segment start time"),
            endTime: z.number().describe("End time in seconds - must match a segment end time"),
            hook: z
              .string()
              .describe("A short, punchy hook that summarizes the clip in a few words"),
          })
        ),
      }),
    }),
    prompt: `You are analyzing a video transcript to identify the best clips.

USER REQUEST: ${prompt}

CONSTRAINTS:
- Identify exactly ${clipCount} clips
- Aim for roughly ${clipDuration} seconds
- Each clip must be between ${Math.max(1, Math.round(clipDuration * 0.75))} and ${Math.max(2, Math.round(clipDuration * 1.5))} seconds
- Do not cut off mid-sentence; adjust to natural breaks within the allowed range
- Clips should not overlap
- Return clips in chronological order
- CRITICAL: startTime and endTime MUST be exact values from the timestamps shown below (e.g., if a segment shows [12.5s - 15.2s], use 12.5 and 15.2)

TRANSCRIPT WITH TIMESTAMPS (use these exact timestamp values):
${segmentsWithTimestamps}

Return ${clipCount} clips with timestamps that exactly match the segment boundaries above.`,
  });

  // Extract actual transcript from segments for each identified clip
  const clipsWithTranscript: IdentifiedClip[] = output!.clips.map((clip) => ({
    ...clip,
    transcript: getTranscriptForTimeRange(segments, clip.startTime, clip.endTime),
  }));

  return { clips: clipsWithTranscript };
}
