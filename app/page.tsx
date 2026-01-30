"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LampHeader } from "@/components/ui/lamp";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { upload } from "@vercel/blob/client";

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
      const uploadResult = await upload(
        `${pipelineId}/input/${selectedFile.name}`,
        selectedFile,
        {
          access: "public",
          handleUploadUrl: "/api/blob",
        }
      );

      const formData = new FormData();
      formData.append("videoUrl", uploadResult.url);
      formData.append("videoName", selectedFile.name);
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
      // Revalidate the sidebar to show the new pipeline (match all paginated keys)
      mutate(
        (key) => typeof key === "string" && key.startsWith("/api/pipelines"),
        undefined,
        { revalidate: true }
      );
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
    <div className="relative flex flex-1 flex-col items-center p-4">
        <div className="absolute right-4 top-4 z-50">
          <ThemeSwitcher />
        </div>
        
        {/* Lamp at the top */}
        {!isUploading && clips.length === 0 && (
          <LampHeader className="mt-8">
            <motion.h1
              initial={{ opacity: 0, y: "35vh", scale: 1.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: 0.3,
                duration: 1.8,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-center text-4xl font-bold tracking-tight text-transparent md:text-5xl"
            >
              You can just clip things
            </motion.h1>
          </LampHeader>
        )}

        {/* Main content */}
        <main className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-6">
        {(isUploading || clips.length > 0) && (
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
            <h1 className="text-center text-4xl font-bold">Make viral clips faster</h1>
          </div>
        )}

        {!isUploading && clips.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              marginTop: 120,
            }}
            transition={{
              delay: selectedFile ? 0 : 2.2,
              duration: selectedFile ? 0.5 : 0.6,
              ease: "easeOut",
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={`relative w-full rounded-lg border-2 border-dashed p-12 text-center cursor-pointer overflow-hidden ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/15 hover:border-primary/30"
            }`}
          >
            <FlickeringGrid
              className="absolute inset-0 z-0"
              squareSize={4}
              gridGap={6}
              color="#6B7280"
              maxOpacity={0.3}
              flickerChance={0.1}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {selectedFile ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setUploadStatus(null);
                    setClips([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="absolute left-3 top-3 z-20 rounded-full p-1.5 hover:bg-muted transition-colors"
                  aria-label="Remove file"
                >
                  <X className="size-5 text-muted-foreground" />
                </button>
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <p className="text-2xl font-semibold">{selectedFile.name}</p>
                  <p className="text-base text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </>
            ) : (
              <div className="relative z-10 flex flex-col items-center gap-4">
                <p className="text-lg font-medium">
                  Drop a long video to get started
                </p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
              </div>
            )}
          </motion.div>
        )}

        {selectedFile && !isUploading && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              ease: "easeOut",
            }}
            className="w-full space-y-6"
          >
            <div>
              <label className="mb-3 block text-lg font-medium">
                What clips are you looking for?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-lg border bg-background p-4 text-lg"
                rows={2}
                maxLength={60}
                placeholder="e.g., Find the most engaging and viral-worthy moments"
              />
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <label className="mb-3 block text-lg font-medium">
                  Number of clips
                </label>
                <Select
                  value={clipCount.toString()}
                  onValueChange={(value) => setClipCount(parseInt(value))}
                >
                  <SelectTrigger className="w-full h-14 text-lg">
                    <SelectValue placeholder="Select clips" />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 6, 9].map((num) => (
                      <SelectItem key={num} value={num.toString()} className="text-lg">
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="mb-3 block text-lg font-medium">
                  Clip duration (seconds)
                </label>
                <Select
                  value={clipDuration.toString()}
                  onValueChange={(value) => setClipDuration(parseInt(value))}
                >
                  <SelectTrigger className="w-full h-14 text-lg">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10" className="text-lg">10</SelectItem>
                    <SelectItem value="12" className="text-lg">12</SelectItem>
                    <SelectItem value="15" className="text-lg">15</SelectItem>
                    <SelectItem value="18" className="text-lg">18</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleUpload();
              }}
              disabled={isUploading || !prompt.trim()}
              className="w-full text-lg py-6"
            >
              {isUploading ? "Processing..." : "Find Clips"}
            </Button>
          </motion.div>
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
