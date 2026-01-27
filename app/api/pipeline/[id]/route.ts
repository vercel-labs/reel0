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
