import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribe";
import { identifyClips } from "@/lib/identify-clips";
import { put } from "@vercel/blob";
import { buildAssContentForClip } from "@/lib/captions";
import { extractAudioInSandbox, generateClipInSandbox } from "@/lib/sandbox-ffmpeg";

export const runtime = "nodejs";
process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("video") as File;
    const prompt = formData.get("prompt") as string;
    const clipCount = parseInt(formData.get("clipCount") as string) || 5;
    const clipDuration = parseInt(formData.get("clipDuration") as string) || 12;

    if (!file) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "File must be a video" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "No prompt provided" },
        { status: 400 }
      );
    }

    const providedPipelineId = formData.get("pipelineId") as string | null;
    const pipelineId =
      providedPipelineId && providedPipelineId.trim().length > 0
        ? providedPipelineId.trim()
        : `pipeline-${Date.now()}`;
    console.log("Uploading video to Blob started");
    const videoBlob = await put(
      `${pipelineId}/input/${file.name}`,
      file,
      { access: "public", contentType: file.type }
    );
    console.log("Uploading video to Blob completed");

    type PipelineStatusClip = {
      title: string;
      reason: string;
      startTime: number;
      endTime: number;
      transcript: string;
      hook: string;
      video: { url: string; mimeType: string } | null;
      status: "pending" | "ready" | "failed";
      error?: string;
    };

    const pipelineStatus: {
      pipelineId: string;
      createdAt: number;
      clips: PipelineStatusClip[];
    } = {
      pipelineId,
      createdAt: Date.now(),
      clips: Array.from({ length: clipCount }, (_, index) => ({
        title: `Clip ${index + 1}`,
        reason: "Generating clip...",
        startTime: 0,
        endTime: 0,
        transcript: "",
        hook: "",
        video: null,
        status: "pending",
      })),
    };

    const statusBlob = await put(
      `${pipelineId}/status.json`,
      JSON.stringify(pipelineStatus),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );

    console.log("Video to audio conversion started (sandbox)");
    const audioBuffer = await extractAudioInSandbox(videoBlob.url);
    console.log("Video to audio conversion completed");

    console.log("Uploading audio to Blob started");
    console.log(`Audio buffer size: ${audioBuffer.length} bytes`);
    
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("Audio extraction failed - empty buffer");
    }
    
    const audioBlob = await put(
      `${pipelineId}/audio/${file.name}.mp3`,
      Buffer.from(audioBuffer),
      {
        access: "public",
        contentType: "audio/mpeg",
      }
    );
    console.log("Uploading audio to Blob completed");

    console.log("Audio to transcription started");
    const transcription = await transcribeAudio(audioBuffer);
    console.log("Audio to transcription completed");

    console.log(`Identifying "${prompt}" related moments started`);
    const clipResult = await identifyClips(
      transcription.transcript,
      transcription.segments,
      prompt,
      clipCount,
      clipDuration
    );
    console.log(`Identifying "${prompt}" related moments completed`);

    const clipRequests = clipResult.clips.map((clip) => ({
      startTime: clip.startTime,
      endTime: clip.endTime,
      assBase64: Buffer.from(
        buildAssContentForClip({
          startTime: clip.startTime,
          endTime: clip.endTime,
          transcript: clip.transcript,
          segments: transcription.segments,
          hook: clip.hook,
        })
      ).toString("base64"),
    }));

    const initialClips = clipResult.clips.map((clip) => ({
      title: clip.title,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      transcript: clip.transcript,
      hook: clip.hook,
    }));

    pipelineStatus.clips = initialClips.map((clip) => ({
      ...clip,
      video: null,
      status: "pending" as const,
    }));

    await put(
      `${pipelineId}/status.json`,
      JSON.stringify(pipelineStatus),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );

    console.log("Video clipping started (sandbox)");
    void Promise.allSettled(
      clipRequests.map(async (clipRequest, index) => {
        try {
          const buffer = await generateClipInSandbox(videoBlob.url, clipRequest, index);
          console.log(`Clip ${index + 1} buffer size: ${buffer.length} bytes`);
          const upload = await put(
            `${pipelineId}/clips/clip-${index + 1}.mp4`,
            Buffer.from(buffer),
            {
              access: "public",
              contentType: "video/mp4",
            }
          );
          pipelineStatus.clips[index] = {
            ...pipelineStatus.clips[index],
            status: "ready",
            video: { url: upload.url, mimeType: "video/mp4" },
          };
        } catch (error) {
          pipelineStatus.clips[index] = {
            ...pipelineStatus.clips[index],
            status: "failed",
            error: error instanceof Error ? error.message : "Clip generation failed",
          };
        }

        await put(
          `${pipelineId}/status.json`,
          JSON.stringify(pipelineStatus),
          {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false,
            allowOverwrite: true,
          }
        );
      })
    );
    console.log("Video clipping queued (sandbox)");

    const clipsWithVideo = pipelineStatus.clips.map((clip) => ({
      ...clip,
    }));

    return NextResponse.json({
      success: true,
      filename: file.name,
      transcript: transcription.transcript,
      durationInSeconds: transcription.durationInSeconds,
      segments: transcription.segments,
      audioUrl: audioBlob.url,
      videoUrl: videoBlob.url,
      pipelineId,
      statusUrl: statusBlob.url,
      clips: clipsWithVideo,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process video" },
      { status: 500 }
    );
  }
}
