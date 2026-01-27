export interface PipelineClipStatus {
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  transcript: string;
  hook: string;
  video: { url: string; mimeType: string } | null;
  status: "pending" | "ready" | "failed";
  error?: string;
}

export interface PipelineStatus {
  pipelineId: string;
  clips: PipelineClipStatus[];
  createdAt: number;
}

const pipelines = new Map<string, PipelineStatus>();

export function initPipeline(
  pipelineId: string,
  clips: Omit<PipelineClipStatus, "video" | "status" | "error">[]
): PipelineStatus {
  const status: PipelineStatus = {
    pipelineId,
    createdAt: Date.now(),
    clips: clips.map((clip) => ({
      ...clip,
      video: null,
      status: "pending",
    })),
  };
  pipelines.set(pipelineId, status);
  return status;
}

export function getPipeline(pipelineId: string): PipelineStatus | null {
  return pipelines.get(pipelineId) ?? null;
}

export function updateClip(
  pipelineId: string,
  index: number,
  update: Partial<PipelineClipStatus>
): void {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    return;
  }
  const clip = pipeline.clips[index];
  if (!clip) {
    return;
  }
  pipeline.clips[index] = { ...clip, ...update };
}
