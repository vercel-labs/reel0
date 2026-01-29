import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await list({ prefix: `${id}/status.json`, limit: 1 });
    if (!result.blobs.length) {
      return NextResponse.json({
        pipelineId: id,
        createdAt: Date.now(),
        clips: [],
      });
    }
    const response = await fetch(`${result.blobs[0].url}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({
        pipelineId: id,
        createdAt: Date.now(),
        clips: [],
      });
    }
    const status = await response.json();

    const clipCount =
      typeof status.clipCount === "number" && status.clipCount > 0
        ? status.clipCount
        : 0;

    if (!Array.isArray(status.clips)) {
      status.clips = [];
    }

    if (clipCount && status.clips.length < clipCount) {
      const placeholders = Array.from({ length: clipCount - status.clips.length }, (_, i) => ({
        title: `Clip ${status.clips.length + i + 1}`,
        reason: "Generating clip...",
        startTime: 0,
        endTime: 0,
        transcript: "",
        hook: "",
        video: null,
        status: "pending",
      }));
      status.clips = [...status.clips, ...placeholders];
    }

    const clipStatusResult = await list({ prefix: `${id}/clips/status-` });
    if (clipStatusResult.blobs.length && Array.isArray(status.clips)) {
      const clipStatusUpdates = await Promise.all(
        clipStatusResult.blobs.map(async (blob) => {
          try {
            const clipResponse = await fetch(`${blob.url}?t=${Date.now()}`, {
              cache: "no-store",
            });
            if (!clipResponse.ok) return null;
            return clipResponse.json();
          } catch {
            return null;
          }
        })
      );

      clipStatusUpdates.forEach((update) => {
        if (!update || typeof update.index !== "number") return;
        const clipIndex = update.index;
        if (!status.clips[clipIndex]) return;
        status.clips[clipIndex] = {
          ...status.clips[clipIndex],
          status: update.status ?? status.clips[clipIndex].status,
          video: update.video ?? status.clips[clipIndex].video,
          error: update.error ?? status.clips[clipIndex].error,
        };
      });
    }

    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch pipeline status" },
      { status: 500 }
    );
  }
}
