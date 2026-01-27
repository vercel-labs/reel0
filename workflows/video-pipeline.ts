import { transcribeAudio, TranscriptionResult } from "@/lib/transcribe";
import { identifyClips, IdentifiedClip } from "@/lib/identify-clips";
import { buildAssContentForClip } from "@/lib/captions";
import { extractAudioInSandbox, generateClipInSandbox } from "@/lib/sandbox-ffmpeg";

export interface PipelineInput {
  pipelineId: string;
  videoUrl: string;
  videoName: string;
  prompt: string;
  clipCount: number;
  clipDuration: number;
}

export interface PipelineStatusClip {
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  transcript: string;
  hook: string;
  video: { url: string; mimeType: string } | null;
  status: "pending" | "ready" | "failed";
  error?: string;
}

export interface PipelineStatus {
  pipelineId: string;
  createdAt: number;
  clipCount: number;
  videoTitle: string;
  transcript: string;
  clips: PipelineStatusClip[];
}

/**
 * Main video processing workflow - orchestrates all durable steps
 */
export async function processVideoPipeline(input: PipelineInput) {
  "use workflow";

  const { pipelineId, videoUrl, videoName, prompt, clipCount, clipDuration } = input;

  // Step 1: Extract audio from video (sandbox operation)
  console.log("Step 1: Extract audio from video");
  const audioResult = await extractAudioStep(pipelineId, videoUrl, videoName, clipCount);

  // Step 2: Transcribe audio
  console.log("Step 2: Transcribe audio");
  const transcription = await transcribeAudioStep(pipelineId, audioResult.audioBuffer);

  // Step 3: Identify clips using LLM
  console.log("Step 3: Identify clips");
  const identifiedClips = await identifyClipsStep(
    pipelineId,
    transcription.transcript,
    transcription.segments,
    prompt,
    clipCount,
    clipDuration
  );

  // Step 4: Generate clips in PARALLEL (each clip is a separate durable step)
  console.log("Step 4: Generate clips in parallel");
  await Promise.all(
    identifiedClips.map((clip, i) =>
      generateClipStep(
        pipelineId,
        videoUrl,
        clip,
        transcription.segments,
        i
      )
    )
  );

  console.log("Pipeline completed!");
  return { pipelineId, status: "completed" };
}

/**
 * Step: Extract audio from video in sandbox
 */
async function extractAudioStep(
  pipelineId: string,
  videoUrl: string,
  videoName: string,
  clipCount: number
): Promise<{ audioBuffer: Buffer; audioUrl: string }> {
  "use step";

  const { put } = await import("@vercel/blob");
  process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

  // Create initial status
  const initialStatus: PipelineStatus = {
    pipelineId,
    createdAt: Date.now(),
    clipCount,
    videoTitle: videoName,
    transcript: "",
    clips: Array.from({ length: clipCount }, (_, index) => ({
      title: `Clip ${index + 1}`,
      reason: "Extracting audio...",
      startTime: 0,
      endTime: 0,
      transcript: "",
      hook: "",
      video: null,
      status: "pending",
    })),
  };
  await updateStatus(put, pipelineId, initialStatus);

  console.log("Extracting audio from video...");
  const audioBuffer = await extractAudioInSandbox(videoUrl);

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Audio extraction failed - empty buffer");
  }

  console.log(`Audio extracted: ${audioBuffer.length} bytes`);

  // Upload audio to Blob
  const audioBlob = await put(
    `${pipelineId}/audio/${videoName}.mp3`,
    Buffer.from(audioBuffer),
    {
      access: "public",
      contentType: "audio/mpeg",
    }
  );

  console.log(`Audio uploaded to: ${audioBlob.url}`);
  return { audioBuffer: Buffer.from(audioBuffer), audioUrl: audioBlob.url };
}

/**
 * Step: Transcribe audio
 */
async function transcribeAudioStep(
  pipelineId: string,
  audioBuffer: Buffer
): Promise<TranscriptionResult> {
  "use step";

  const { put } = await import("@vercel/blob");
  process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

  console.log("Transcribing audio...");
  const result = await transcribeAudio(audioBuffer);
  console.log(`Transcription complete: ${result.segments.length} segments, ${result.durationInSeconds}s`);

  // Update status with transcript
  const currentStatus = await getStatus(pipelineId);
  if (currentStatus) {
    currentStatus.transcript = result.transcript;
    currentStatus.clips = currentStatus.clips.map((clip) => ({
      ...clip,
      reason: "Identifying clips...",
    }));
    await updateStatus(put, pipelineId, currentStatus);
  }

  return result;
}

/**
 * Step: Identify clips using LLM
 */
async function identifyClipsStep(
  pipelineId: string,
  transcript: string,
  segments: Array<{ text: string; start: number; end: number }>,
  prompt: string,
  clipCount: number,
  clipDuration: number
): Promise<IdentifiedClip[]> {
  "use step";

  const { put } = await import("@vercel/blob");
  process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

  console.log(`Identifying ${clipCount} clips for: "${prompt}"`);
  const result = await identifyClips(transcript, segments, prompt, clipCount, clipDuration);
  console.log(`Identified ${result.clips.length} clips`);

  // Update status with identified clips
  const currentStatus = await getStatus(pipelineId);
  if (currentStatus) {
    currentStatus.clips = result.clips.map((clip) => ({
      title: clip.title,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      transcript: clip.transcript,
      hook: clip.hook,
      video: null,
      status: "pending" as const,
    }));
    await updateStatus(put, pipelineId, currentStatus);
  }

  return result.clips;
}

/**
 * Step: Generate a single video clip in sandbox (runs in parallel)
 */
async function generateClipStep(
  pipelineId: string,
  videoUrl: string,
  clip: IdentifiedClip,
  segments: Array<{ text: string; start: number; end: number }>,
  index: number
): Promise<string> {
  "use step";

  const { put } = await import("@vercel/blob");
  process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

  console.log(`[Parallel] Generating clip ${index + 1}: ${clip.title}`);

  const assContent = buildAssContentForClip({
    startTime: clip.startTime,
    endTime: clip.endTime,
    transcript: clip.transcript,
    segments,
    hook: clip.hook,
  });

  const clipRequest = {
    startTime: clip.startTime,
    endTime: clip.endTime,
    assBase64: Buffer.from(assContent).toString("base64"),
  };

  let clipUrl = "";
  let clipStatus: "ready" | "failed" = "ready";
  let errorMsg = "";

  try {
    const buffer = await generateClipInSandbox(videoUrl, clipRequest, index);
    console.log(`[Parallel] Clip ${index + 1} generated: ${buffer.length} bytes`);

    // Upload clip to Blob
    const upload = await put(
      `${pipelineId}/clips/clip-${index + 1}.mp4`,
      Buffer.from(buffer),
      {
        access: "public",
        contentType: "video/mp4",
      }
    );

    console.log(`[Parallel] Clip ${index + 1} uploaded to: ${upload.url}`);
    clipUrl = upload.url;
  } catch (error) {
    clipStatus = "failed";
    errorMsg = error instanceof Error ? error.message : "Clip generation failed";
    console.error(`[Parallel] Clip ${index + 1} failed: ${errorMsg}`);
  }

  await updateClipStatus(put, pipelineId, index, {
    status: clipStatus,
    video: clipStatus === "ready" ? { url: clipUrl, mimeType: "video/mp4" } : null,
    error: clipStatus === "failed" ? errorMsg : undefined,
  });

  return clipUrl;
}

/**
 * Helper: Get current pipeline status from Blob storage
 */
async function getStatus(pipelineId: string): Promise<PipelineStatus | null> {
  try {
    const { list } = await import("@vercel/blob");
    const blobs = await list({ prefix: `${pipelineId}/status.json` });
    if (blobs.blobs.length === 0) return null;
    const res = await fetch(blobs.blobs[0].url);
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Helper: Update pipeline status in Blob storage
 */
async function updateStatus(
  put: typeof import("@vercel/blob").put,
  pipelineId: string,
  status: PipelineStatus
): Promise<void> {
  await put(
    `${pipelineId}/status.json`,
    Buffer.from(JSON.stringify(status)),
    {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      onUploadProgress: () => {},
    }
  );
}

/**
 * Helper: Update a single clip status without clobbering others
 */
async function updateClipStatus(
  put: typeof import("@vercel/blob").put,
  pipelineId: string,
  index: number,
  update: Pick<PipelineStatusClip, "status" | "video" | "error">
): Promise<void> {
  await put(
    `${pipelineId}/clips/status-${index + 1}.json`,
    Buffer.from(JSON.stringify({ index, ...update })),
    {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      onUploadProgress: () => {},
    }
  );
}
