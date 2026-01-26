import { NextRequest, NextResponse } from "next/server";
import { extractAudioFromBuffer } from "@/lib/extract-audio";
import { transcribeAudio } from "@/lib/transcribe";
import { identifyClips } from "@/lib/identify-clips";
import { generateVideoClips } from "@/lib/clip-video";

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

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    // Extract audio from video
    const audioBuffer = await extractAudioFromBuffer(videoBuffer, file.name);

    // Transcribe audio using Deepgram
    const transcription = await transcribeAudio(audioBuffer);

    // Identify clips based on user prompt
    const clipResult = await identifyClips(
      transcription.transcript,
      transcription.segments,
      prompt,
      clipCount,
      clipDuration
    );

    // Generate video clips using ffmpeg (with burned-in captions)
    const generatedClips = await generateVideoClips(
      videoBuffer,
      clipResult.clips.map((clip) => ({
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        hook: clip.hook,
        transcript: clip.transcript,
        segments: transcription.segments,
      })),
      file.name
    );

    // Merge clip metadata with generated video data
    const clipsWithVideo = clipResult.clips.map((clip, index) => ({
      ...clip,
      video: generatedClips[index] || null,
    }));

    return NextResponse.json({
      success: true,
      filename: file.name,
      transcript: transcription.transcript,
      durationInSeconds: transcription.durationInSeconds,
      segments: transcription.segments,
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
