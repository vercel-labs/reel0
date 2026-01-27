import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribe";
import { identifyClips } from "@/lib/identify-clips";
import { put } from "@vercel/blob";
import { buildAssContentForClip } from "@/lib/captions";
import { extractAudioInSandbox, generateClipsInSandbox } from "@/lib/sandbox-ffmpeg";

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

    const pipelineId = `pipeline-${Date.now()}`;
    console.log("Uploading video to Blob started");
    const videoBlob = await put(
      `${pipelineId}/input/${file.name}`,
      file,
      { access: "public", contentType: file.type }
    );
    console.log("Uploading video to Blob completed");

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

    console.log("Video clipping started (sandbox)");
    const clipBuffers = await generateClipsInSandbox(videoBlob.url, clipRequests);
    console.log("Video clipping completed (sandbox)");

    console.log("Uploading clips to Blob started");
    const clipUploads = await Promise.all(
      clipBuffers.map((buffer, index) => {
        console.log(`Clip ${index + 1} buffer size: ${buffer.length} bytes`);
        return put(
          `${pipelineId}/clips/clip-${index + 1}.mp4`,
          Buffer.from(buffer),
          {
            access: "public",
            contentType: "video/mp4",
          }
        );
      })
    );
    console.log("Uploading clips to Blob completed");

    // Merge clip metadata with generated video data
    const clipsWithVideo = clipResult.clips.map((clip, index) => ({
      ...clip,
      video: clipUploads[index]
        ? { url: clipUploads[index].url, mimeType: "video/mp4" }
        : null,
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
