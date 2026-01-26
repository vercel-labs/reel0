"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";

interface VideoData {
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  data: string;
  mimeType: string;
}

interface Clip {
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  transcript: string;
  video?: VideoData | null;
}

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [prompt, setPrompt] = useState("Find the most engaging and viral-worthy moments");
  const [clipCount, setClipCount] = useState(3);
  const [clipDuration, setClipDuration] = useState(12);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    setIsUploading(true);
    setUploadStatus(null);
    setTranscript(null);
    setClips([]);

    try {
      const formData = new FormData();
      formData.append("video", selectedFile);
      formData.append("prompt", prompt);
      formData.append("clipCount", clipCount.toString());
      formData.append("clipDuration", clipDuration.toString());

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setTranscript(data.transcript);
      setClips(data.clips || []);
      const minutes = Math.floor(data.durationInSeconds / 60);
      const seconds = Math.round(data.durationInSeconds % 60);
      const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      setUploadStatus(`Found ${data.clips?.length || 0} clips from ${duration} of audio`);
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
    if (!clip.video?.data) return;
    
    const byteCharacters = atob(clip.video.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: clip.video.mimeType });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.title.replace(/[^a-z0-9]/gi, "_")}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <main className="flex w-full max-w-2xl flex-col items-center gap-6">
        <h1 className="text-4xl font-bold">Video Clip Finder</h1>
        
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

        {selectedFile && (
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
                  setTranscript(null);
                  setClips([]);
                }}
                disabled={isUploading}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {uploadStatus && (
          <p
            className={`text-sm ${
              uploadStatus.includes("Found") ? "text-green-600" : "text-red-600"
            }`}
          >
            {uploadStatus}
          </p>
        )}

        {clips.length > 0 && (
          <div className="w-full space-y-4">
            <h2 className="text-lg font-semibold">Identified Clips</h2>
            {clips.map((clip, index) => (
              <div
                key={index}
                className="rounded-lg border bg-muted/50 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-medium">{clip.title}</h3>
                  <span className="shrink-0 rounded bg-primary/10 px-2 py-1 text-xs font-mono">
                    {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                  </span>
                </div>
                
                {clip.video?.data && (
                  <div className="space-y-2">
                    <video
                      controls
                      className="w-full rounded-lg"
                      src={`data:${clip.video.mimeType};base64,${clip.video.data}`}
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
                )}
                
                <p className="text-sm text-muted-foreground">{clip.reason}</p>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View transcript
                  </summary>
                  <p className="mt-2 italic border-l-2 pl-3 border-muted-foreground/25">
                    &quot;{clip.transcript}&quot;
                  </p>
                </details>
              </div>
            ))}
          </div>
        )}

        {transcript && (
          <details className="w-full">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              View full transcript
            </summary>
            <div className="mt-4 rounded-lg border bg-muted/50 p-6">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {transcript}
              </p>
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
