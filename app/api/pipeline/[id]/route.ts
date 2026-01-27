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
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch pipeline status" },
      { status: 500 }
    );
  }
}
