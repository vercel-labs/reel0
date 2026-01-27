"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
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

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [prompt, setPrompt] = useState("Find the most engaging and viral-worthy moments");
  const [clipCount, setClipCount] = useState(3);
  const [clipDuration, setClipDuration] = useState(12);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setSelectedFile(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("video/")) {
      setSelectedFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const pipelineId = `pipeline-${Date.now()}`;
    router.push(`/p/${pipelineId}?count=${clipCount}`);

    setIsUploading(true);
    setUploadStatus(null);
    setClips(
      Array.from({ length: clipCount }, (_, index) => ({
        title: `Clip ${index + 1}`,
        reason: "Generating clip...",
        startTime: 0,
        endTime: 0,
        transcript: "",
        status: "pending",
        video: null,
      }))
    );

    try {
      const formData = new FormData();
      formData.append("video", selectedFile);
      formData.append("prompt", prompt);
      formData.append("clipCount", clipCount.toString());
      formData.append("clipDuration", clipDuration.toString());
      formData.append("pipelineId", pipelineId);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setClips(data.clips || []);
      setSelectedFile(null);
    } catch (error) {
      setUploadStatus(
        error instanceof Error ? error.message : "Upload failed"
      );
    } finally {
      setIsUploading(false);
    }
  };

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

  const resetToHome = () => {
    setSelectedFile(null);
    setClips([]);
    setUploadStatus(null);
    setIsUploading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <main className="flex w-full max-w-6xl flex-col items-center gap-6">
        <div className="relative w-full">
          {clips.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetToHome}
              className="absolute left-0 top-1/2 -translate-y-1/2"
            >
              Home
            </Button>
          )}
          <h1 className="text-center text-4xl font-bold">Video Clip Finder</h1>
        </div>

        {!isUploading && clips.length === 0 && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={`w-full rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-lg font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <p className="text-lg font-medium">
                  Drag and drop a video file here
                </p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
              </div>
            )}
          </div>
        )}

        {selectedFile && !isUploading && (
          <div className="w-full space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                What clips are you looking for?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-lg border bg-background p-3 text-sm"
                rows={2}
                placeholder="e.g., Find the most engaging and viral-worthy moments"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium">
                  Number of clips
                </label>
                <input
                  type="number"
                  value={clipCount}
                  onChange={(e) => setClipCount(parseInt(e.target.value) || 1)}
                  min={1}
                  max={20}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium">
                  Clip duration (seconds)
                </label>
                <input
                  type="number"
                  value={clipDuration}
                  onChange={(e) => setClipDuration(parseInt(e.target.value) || 1)}
                  min={5}
                  max={120}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                disabled={isUploading || !prompt.trim()}
                className="flex-1"
              >
                {isUploading ? "Processing..." : "Find Clips"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setUploadStatus(null);
                  setClips([]);
                }}
                disabled={isUploading}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {clips.length > 0 && (
          <div className="w-full space-y-4">
            <div className="flex flex-wrap gap-6">
              {clips.map((clip, index) => (
                <div
                  key={index}
                  className="w-full rounded-lg border bg-muted/50 p-4 space-y-4 sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
                >
                  <div className="space-y-2">
                    <h3 className="font-medium">{clip.title}</h3>
                    <span className="inline-flex rounded bg-primary/10 px-2 py-1 text-xs font-mono">
                      {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                    </span>
                  </div>

                  {clip.video?.url ? (
                    <div className="space-y-2">
                      <video
                        controls
                        className="w-full rounded-lg"
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
                    <div className="space-y-2">
                      <Skeleton className="h-56 w-full rounded-lg" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  )}

                  {clip.status === "failed" && (
                    <p className="text-sm text-red-600">
                      Failed to generate clip{clip.error ? `: ${clip.error}` : ""}
                    </p>
                  )}

                  <p className="text-sm text-muted-foreground">{clip.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
