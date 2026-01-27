"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface VideoData {
  url: string;
  mimeType: string;
}

interface Clip {
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  transcript: string;
  hook?: string;
  status?: "pending" | "ready" | "failed";
  error?: string;
  video?: VideoData | null;
}

export default function PipelinePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clips, setClips] = useState<Clip[]>([]);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [clipCount, setClipCount] = useState<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  
  // Use clipCount from status.json if available, else fall back to query param
  const initialCount = parseInt(searchParams.get("count") || "3", 10) || 3;
  const skeletonCount = Math.max(1, Math.min(20, clipCount ?? initialCount));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const downloadClip = (clip: Clip) => {
    if (!clip.video?.url) return;

    const a = document.createElement("a");
    a.href = clip.video.url;
    a.download = `${clip.title.replace(/[^a-z0-9]/gi, "_")}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    const pipelineId = params?.id;
    if (!pipelineId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/pipeline/${pipelineId}?t=${Date.now()}`);
        if (!res.ok) return;
        const status = await res.json();
        setClips(status.clips || []);
        setVideoTitle(status.videoTitle || null);
        if (status.clipCount) setClipCount(status.clipCount);
        
        // Only stop polling if we have clips AND all are done
        const clipsArray = status.clips || [];
        const allDone = clipsArray.length > 0 && clipsArray.every(
          (clip: Clip) => clip.status === "ready" || clip.status === "failed"
        );
        if (allDone && pollIntervalRef.current) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch {
        // Continue polling on error
      }
    };

    fetchStatus();
    pollIntervalRef.current = window.setInterval(fetchStatus, 2000);

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [params]);

  const displayClips =
    clips.length > 0
      ? clips
      : Array.from({ length: skeletonCount }, (_, index) => ({
          title: `Clip ${index + 1}`,
          reason: "Generating clip...",
          startTime: 0,
          endTime: 0,
          transcript: "",
          status: "pending" as const,
          video: null,
        }));

  return (
    <div className="flex min-h-screen items-start justify-center p-4 pt-8">
      <main className="flex w-full max-w-6xl flex-col items-center gap-6">
        <div className="relative w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/")}
            className="absolute left-0 top-1/2 -translate-y-1/2"
          >
            Home
          </Button>
          <h1 className="text-center text-4xl font-bold">Video Clip Finder</h1>
        </div>

        {videoTitle && (
          <p className="text-sm text-muted-foreground">Video: {videoTitle}</p>
        )}

        <div className="w-full space-y-4">
          <div className="flex flex-wrap gap-6">
            {displayClips.map((clip, index) => (
                <div
                  key={index}
                  className="flex w-full flex-col rounded-lg border bg-muted/50 p-4 sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
                >
                  <div className="min-h-[64px] space-y-2">
                    <h3
                      className="font-medium leading-tight min-h-[44px]"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {clip.title}
                    </h3>
                    <span className="inline-flex rounded bg-primary/10 px-2 py-1 text-xs font-mono">
                      {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                    </span>
                  </div>

                  {clip.video?.url ? (
                    <div className="mt-4 space-y-2">
                    <video
                      controls
                        className="aspect-[9/16] w-full rounded-lg object-cover"
                      src={clip.video.url}
                    >
                      Your browser does not support the video tag.
                    </video>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadClip(clip)}
                      className="w-full"
                    >
                      Download Clip
                    </Button>
                  </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <Skeleton className="aspect-[9/16] w-full rounded-lg" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  )}

                  {clip.status === "failed" && (
                    <p className="mt-4 text-sm text-red-600">
                      Failed to generate clip{clip.error ? `: ${clip.error}` : ""}
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
