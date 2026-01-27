import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { start } from "workflow/api";
import { processVideoPipeline } from "@/workflows/video-pipeline";

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

    // Upload video to Blob first (before starting workflow)
    console.log("Uploading video to Blob started");
    const videoBlob = await put(
      `${pipelineId}/input/${file.name}`,
      file,
      { access: "public", contentType: file.type }
    );
    console.log("Uploading video to Blob completed");

    // Create initial status
    const pipelineStatus = {
      pipelineId,
      createdAt: Date.now(),
      clipCount,
      videoTitle: file.name,
      transcript: "",
      clips: Array.from({ length: clipCount }, (_, index) => ({
        title: `Clip ${index + 1}`,
        reason: "Generating clip...",
        startTime: 0,
        endTime: 0,
        transcript: "",
        hook: "",
        video: null,
        status: "pending" as const,
      })),
    };

    const statusBlob = await put(
      `${pipelineId}/status.json`,
      Buffer.from(JSON.stringify(pipelineStatus)),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        onUploadProgress: () => {},
      }
    );
    console.log(`Status blob created: ${statusBlob.url}`);

    // Start the durable workflow (runs asynchronously)
    console.log("Starting durable video processing workflow...");
    await start(processVideoPipeline, [{
      pipelineId,
      videoUrl: videoBlob.url,
      videoName: file.name,
      prompt,
      clipCount,
      clipDuration,
    }]);
    console.log("Workflow started successfully");

    return NextResponse.json({
      success: true,
      pipelineId,
      videoUrl: videoBlob.url,
      statusUrl: statusBlob.url,
      message: "Video processing workflow started",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process video" },
      { status: 500 }
    );
  }
}
