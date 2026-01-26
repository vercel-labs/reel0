import ffmpeg from "fluent-ffmpeg";
import "@/lib/ffmpeg-config";
import { getFfmpegPath } from "@/lib/ffmpeg-config";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

export interface ClipRequest {
  startTime: number;
  endTime: number;
  title: string;
  hook: string;
  transcript: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export interface GeneratedClip {
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  data: string; // base64 encoded video
  mimeType: string;
}

let subtitlesAvailablePromise: Promise<boolean> | null = null;

function isSubtitlesAvailable(): Promise<boolean> {
  if (!subtitlesAvailablePromise) {
    subtitlesAvailablePromise = (async () => {
      const execFileAsync = promisify(execFile);
      const ffmpegPath = getFfmpegPath() ?? "ffmpeg";
      try {
        const { stdout } = await execFileAsync(ffmpegPath, ["-filters"]);
        return /\bsubtitles\b/.test(stdout);
      } catch {
        return false;
      }
    })();
  }
  return subtitlesAvailablePromise;
}

async function ensureSubtitlesAvailable(): Promise<void> {
  const available = await isSubtitlesAvailable();
  if (!available) {
    throw new Error(
      "Captions require ffmpeg with the subtitles filter (libass/libfreetype). " +
        "Install and reinstall ffmpeg (e.g. `brew install freetype libass && brew reinstall ffmpeg`) " +
        "or set FFMPEG_PATH to a binary that includes subtitles."
    );
  }
}

function escapeAssText(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/,/g, "\\,");
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(seconds, 0);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function buildAssContent(
  words: Array<{ word: string; start: number; end: number }>
): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Words,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,40,40,120,1",
    "Style: Hook,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,80,80,120,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = words.map((entry) => {
    const start = formatAssTime(entry.start);
    const end = formatAssTime(entry.end);
    const text = escapeAssText(entry.word);
    return `Dialogue: 0,${start},${end},Words,,0,0,0,,${text}`;
  });

  return [...header, ...events].join("\n");
}

function escapeSubtitlePath(filePath: string): string {
  return filePath
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'");
}

function buildWordTimings(
  segments: ClipRequest["segments"],
  clipStart: number,
  clipEnd: number,
  fallbackTranscript: string
): Array<{ word: string; start: number; end: number }> {
  const words: Array<{ word: string; start: number; end: number }> = [];
  const overlapping = segments.filter(
    (seg) => seg.end > clipStart && seg.start < clipEnd
  );

  if (overlapping.length === 0) {
    const fallbackWords = fallbackTranscript.split(/\s+/).filter(Boolean);
    const totalDuration = Math.max(clipEnd - clipStart, 0.1);
    const perWord = totalDuration / Math.max(fallbackWords.length, 1);
    return fallbackWords.map((word, index) => ({
      word,
      start: index * perWord,
      end: (index + 1) * perWord,
    }));
  }

  for (const seg of overlapping) {
    const segStart = Math.max(seg.start, clipStart);
    const segEnd = Math.min(seg.end, clipEnd);
    const segDuration = Math.max(segEnd - segStart, 0);
    const segWords = seg.text.split(/\s+/).filter(Boolean);
    if (segWords.length === 0 || segDuration <= 0) {
      continue;
    }
    const perWord = segDuration / segWords.length;
    segWords.forEach((word, index) => {
      const start = segStart + index * perWord;
      const end = start + perWord;
      words.push({
        word,
        start: start - clipStart,
        end: end - clipStart,
      });
    });
  }

  return words;
}

/**
 * Extracts a clip with letterboxing and burned-in captions at the top.
 */
async function extractClipWithCaptions(
  videoPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  transcript: string,
  segments: ClipRequest["segments"],
  hook: string
): Promise<void> {
  const words = buildWordTimings(segments, startTime, startTime + duration, transcript);
  const hookLines = wrapText(hook, 28);
  const hookText = hookLines.map((line) => escapeAssText(line)).join("\\N");
  const assContent = buildAssContent(words);
  const tempDir = os.tmpdir();
  const assPath = path.join(tempDir, `captions-${Date.now()}-${Math.random()}.ass`);
  const hookEvent = `Dialogue: 1,${formatAssTime(0)},${formatAssTime(duration)},Hook,,0,0,0,,${hookText}`;
  await fs.writeFile(
    assPath,
    `${assContent}\n${hookEvent}`,
    "utf8"
  );

  const escapedAssPath = escapeSubtitlePath(assPath);
  const filters = [
    // Scale to fit within 1080x1920 while preserving aspect ratio
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    // Pad to exactly 1080x1920 with black bars, centered
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
    // Burn in ASS subtitles (word-by-word)
    `subtitles='${escapedAssPath}':original_size=1080x1920`,
  ];

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoFilters(filters)
      .output(outputPath)
      .outputOptions([
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-preset", "fast",
      ])
      .on("end", async () => {
        await fs.unlink(assPath).catch(() => {});
        resolve();
      })
      .on("error", async (err) => {
        await fs.unlink(assPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

/**
 * Generates multiple video clips from a source video based on timestamps.
 * Crops to 9:16 mobile aspect ratio with burned-in captions.
 */
export async function generateVideoClips(
  videoBuffer: Buffer,
  clips: ClipRequest[],
  originalFilename: string
): Promise<GeneratedClip[]> {
  await ensureSubtitlesAvailable();

  const tempDir = os.tmpdir();
  const sessionId = Date.now();
  const ext = path.extname(originalFilename) || ".mp4";
  const videoPath = path.join(tempDir, `source-${sessionId}${ext}`);

  try {
    // Write source video to temp file
    await fs.writeFile(videoPath, videoBuffer);

    const generatedClips: GeneratedClip[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const duration = clip.endTime - clip.startTime;
      const outputPath = path.join(tempDir, `clip-${sessionId}-${i}.mp4`);

      try {
        // Extract, crop to 9:16, and add captions
        await extractClipWithCaptions(
          videoPath,
          outputPath,
          clip.startTime,
          duration,
          clip.transcript,
          clip.segments,
          clip.hook
        );

        // Read clip and convert to base64
        const clipBuffer = await fs.readFile(outputPath);
        const base64Data = clipBuffer.toString("base64");

        generatedClips.push({
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration,
          data: base64Data,
          mimeType: "video/mp4",
        });

        // Clean up
        await fs.unlink(outputPath).catch(() => {});
      } catch (err) {
        console.error(`Failed to generate clip ${i}:`, err);
        await fs.unlink(outputPath).catch(() => {});
      }
    }

    return generatedClips;
  } finally {
    // Clean up source video
    await fs.unlink(videoPath).catch(() => {});
  }
}
