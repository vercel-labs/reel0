import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export interface ClipRequest {
  startTime: number;
  endTime: number;
  title: string;
  transcript: string;
}

export interface GeneratedClip {
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  data: string; // base64 encoded video
  mimeType: string;
}

/**
 * Extracts a clip and fits to 9:16 mobile aspect ratio with letterboxing.
 * Preserves the entire video content with black bars.
 */
function extractClip(
  videoPath: string,
  outputPath: string,
  startTime: number,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoFilters([
        // Scale to fit within 1080x1920 while preserving aspect ratio
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        // Pad to exactly 1080x1920 with black bars, centered
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      ])
      .output(outputPath)
      .outputOptions([
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-preset", "fast",
      ])
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
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
        // Extract and crop to 9:16
        await extractClip(videoPath, outputPath, clip.startTime, duration);

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
