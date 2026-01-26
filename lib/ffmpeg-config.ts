import ffmpeg from "fluent-ffmpeg";
import path from "path";

let resolvedFfmpegPath: string | null = null;

function resolveFfmpegPath(): string | null {
  const rawPath = process.env.FFMPEG_PATH;
  if (!rawPath) {
    return null;
  }
  return rawPath.replace(/^"+|"+$/g, "").trim();
}

resolvedFfmpegPath = resolveFfmpegPath();
if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);

  // Ensure the configured binary is preferred by any subprocess calls.
  const binDir = path.dirname(resolvedFfmpegPath);
  const currentPath = process.env.PATH ?? "";
  if (!currentPath.startsWith(`${binDir}:`)) {
    process.env.PATH = `${binDir}:${currentPath}`;
  }
  console.log(`[ffmpeg] Using FFMPEG_PATH: ${resolvedFfmpegPath}`);
} else {
  console.log("[ffmpeg] Using system ffmpeg from PATH");
}

export function getFfmpegPath(): string | null {
  return resolvedFfmpegPath;
}
