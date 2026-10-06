import { NextRequest, NextResponse } from "next/server";
import { head, put } from "@vercel/blob";
import { start } from "workflow/api";
import { processVideoPipeline } from "@/workflows/video-pipeline";

export const runtime = "nodejs";
process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH = "1";

async function validateUploadedVideo(
  videoUrl: string,
  pipelineId: string
): Promise<{ url: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return { error: "Invalid video URL" };
  }

  if (url.protocol !== "https:") {
    return { error: "Video URL must use HTTPS" };
  }

  try {
    // `head` authenticates with BLOB_READ_WRITE_TOKEN, so it only succeeds for
    // objects in the Blob store configured for this application.
    const blob = await head(videoUrl);
    if (!blob.pathname.startsWith(`${pipelineId}/input/`)) {
      return { error: "Video URL does not belong to this pipeline" };
    }

    if (!blob.contentType.startsWith("video/")) {
      return { error: "Uploaded file must be a video" };
    }

    return { url: blob.url };
  } catch {
    return { error: "Video URL must reference an uploaded video" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const videoUrlEntry = formData.get("videoUrl");
    const videoUrl = typeof videoUrlEntry === "string" ? videoUrlEntry : null;
    const videoNameEntry = formData.get("videoName");
    const videoName = typeof videoNameEntry === "string" ? videoNameEntry : null;
    const promptEntry = formData.get("prompt");
    const prompt = typeof promptEntry === "string" ? promptEntry : "";
    const clipCountEntry = formData.get("clipCount");
    const clipCount = parseInt(typeof clipCountEntry === "string" ? clipCountEntry : "") || 5;
    const clipDurationEntry = formData.get("clipDuration");
    const clipDuration = parseInt(typeof clipDurationEntry === "string" ? clipDurationEntry : "") || 12;

    if (!file && !videoUrl) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    if (file && !file.type.startsWith("video/")) {
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

    const pipelineIdEntry = formData.get("pipelineId");
    const providedPipelineId =
      typeof pipelineIdEntry === "string" ? pipelineIdEntry : null;
    const pipelineId =
      providedPipelineId && providedPipelineId.trim().length > 0
        ? providedPipelineId.trim()
        : `pipeline-${Date.now()}`;

    // Upload video to Blob first (before starting workflow)
    if (!videoUrl) {
      return NextResponse.json(
        { error: "Missing videoUrl from Blob upload" },
        { status: 400 }
      );
    }

    const validatedVideo = await validateUploadedVideo(videoUrl, pipelineId);
    if ("error" in validatedVideo) {
      return NextResponse.json({ error: validatedVideo.error }, { status: 400 });
    }

    const resolvedVideoName =
      videoName?.trim() || file?.name || "uploaded-video.mp4";

    // Create initial status
    const pipelineStatus = {
      pipelineId,
      createdAt: Date.now(),
      clipCount,
      videoTitle: resolvedVideoName,
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
      videoUrl: validatedVideo.url,
      videoName: resolvedVideoName,
      prompt,
      clipCount,
      clipDuration,
    }]);
    console.log("Workflow started successfully");

    return NextResponse.json({
      success: true,
      pipelineId,
      videoUrl: validatedVideo.url,
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
