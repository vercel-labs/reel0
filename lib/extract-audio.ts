import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Extracts audio from a video file and saves it as an MP3 file.
 * @param videoFilePath - The path to the video file.
 * @param outputAudioPath - The path where the extracted audio file should be saved.
 */
export function extractAudioFromVideo(
  videoFilePath: string,
  outputAudioPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoFilePath)
      .outputFormat("mp3")
      .on("end", () => {
        console.log(`Extraction completed: ${outputAudioPath}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`Error extracting audio: ${err.message}`);
        reject(err);
      })
      .save(outputAudioPath);
  });
}

/**
 * Extracts audio from a video file buffer and returns the audio buffer.
 * @param videoBuffer - The video file buffer.
 * @param originalFilename - The original filename (for extension detection).
 */
export async function extractAudioFromBuffer(
  videoBuffer: Buffer,
  originalFilename: string
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const videoPath = path.join(tempDir, `video-${Date.now()}-${originalFilename}`);
  const audioPath = path.join(tempDir, `audio-${Date.now()}.mp3`);

  try {
    // Write video buffer to temporary file
    await fs.writeFile(videoPath, videoBuffer);

    // Extract audio
    await extractAudioFromVideo(videoPath, audioPath);

    // Read audio file
    const audioBuffer = await fs.readFile(audioPath);

    return audioBuffer;
  } finally {
    // Clean up temporary files
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
  }
}
