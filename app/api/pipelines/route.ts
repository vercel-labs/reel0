import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";

interface PipelineSummary {
  pipelineId: string;
  videoTitle: string;
  createdAt: number;
  clipCount: number;
  readyClips: number;
}

const PAGE_SIZE = 15;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || String(PAGE_SIZE), 10),
      50
    );

    // List all status.json files to find all pipelines
    // Vercel Blob doesn't support true cursor pagination, so we fetch all and paginate in memory
    const result = await list({ prefix: "pipeline-" });

    // Filter for status.json files only
    const statusBlobs = result.blobs.filter((blob) =>
      blob.pathname.endsWith("/status.json")
    );

    // Fetch each status file to get pipeline details
    const pipelines: (PipelineSummary | null)[] = await Promise.all(
      statusBlobs.map(async (blob) => {
        try {
          const response = await fetch(`${blob.url}?t=${Date.now()}`, {
            cache: "no-store",
          });
          if (!response.ok) return null;
          const status = await response.json();

          const readyClips = Array.isArray(status.clips)
            ? status.clips.filter(
                (clip: { status?: string }) => clip.status === "ready"
              ).length
            : 0;

          return {
            pipelineId: status.pipelineId,
            videoTitle: status.videoTitle || "Untitled Video",
            createdAt: status.createdAt || blob.uploadedAt.getTime(),
            clipCount: status.clipCount || 0,
            readyClips,
          };
        } catch {
          return null;
        }
      })
    );

    // Filter out failed fetches and sort by creation date (newest first)
    const validPipelines = pipelines
      .filter((p): p is PipelineSummary => p !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    // Find the starting index based on cursor (cursor is the createdAt timestamp)
    let startIndex = 0;
    if (cursor) {
      const cursorTimestamp = parseInt(cursor, 10);
      startIndex = validPipelines.findIndex((p) => p.createdAt < cursorTimestamp);
      if (startIndex === -1) {
        startIndex = validPipelines.length; // No more items after cursor
      }
    }

    // Get the page of results
    const paginatedPipelines = validPipelines.slice(
      startIndex,
      startIndex + limit
    );

    // Determine the next cursor (use the last item's createdAt)
    const hasMore = startIndex + limit < validPipelines.length;
    const nextCursor = hasMore
      ? paginatedPipelines[paginatedPipelines.length - 1]?.createdAt.toString()
      : null;

    return NextResponse.json({
      pipelines: paginatedPipelines,
      nextCursor,
      hasMore,
      total: validPipelines.length,
    });
  } catch (error) {
    console.error("Failed to list pipelines:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipelines" },
      { status: 500 }
    );
  }
}
