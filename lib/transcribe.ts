import { experimental_transcribe as transcribe } from "ai";
import { deepgram } from "@ai-sdk/deepgram";

export interface TranscriptionResult {
  transcript: string;
  durationInSeconds: number;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

/**
 * Transcribes audio using Deepgram via AI SDK.
 * @param audioBuffer - The audio file buffer (MP3).
 * @returns Transcription result with transcript text and segments.
 */
export async function transcribeAudio(
  audioBuffer: Buffer
): Promise<TranscriptionResult> {
  const result = await transcribe({
    model: deepgram.transcription("nova-3"),
    audio: audioBuffer,
    providerOptions: {
      deepgram: {
        punctuate: true,
        paragraphs: true,
      },
    },
  });

  return {
    transcript: result.text,
    durationInSeconds: result.durationInSeconds || 0,
    segments: (result.segments || []).map((seg) => ({
      text: seg.text,
      start: seg.startSecond,
      end: seg.endSecond,
    })),
  };
}
