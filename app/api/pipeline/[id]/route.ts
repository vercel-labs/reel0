import { NextRequest, NextResponse } from "next/server";
import { head, BlobNotFoundError } from "@vercel/blob";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await head(`${id}/status.json`);
    const response = await fetch(result.url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }
    const status = await response.json();
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to fetch pipeline status" },
      { status: 500 }
    );
  }
}
