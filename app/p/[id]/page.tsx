"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const [clips, setClips] = useState<Clip[]>([]);
  const pollIntervalRef = useRef<number | null>(null);
  const skeletonCount = 3;

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
      const res = await fetch(`/api/pipeline/${pipelineId}?t=${Date.now()}`);
      if (!res.ok) return;
      const status = await res.json();
      setClips(status.clips || []);
      const allDone = (status.clips || []).every(
        (clip: Clip) => clip.status === "ready" || clip.status === "failed"
      );
      if (allDone && pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    fetchStatus();
    pollIntervalRef.current = window.setInterval(fetchStatus, 3000);

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

                  <div className="mt-4 min-h-[56px]">
                    {clip.status === "failed" && (
                      <p className="text-sm text-red-600">
                        Failed to generate clip{clip.error ? `: ${clip.error}` : ""}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">{clip.reason}</p>
                  </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
