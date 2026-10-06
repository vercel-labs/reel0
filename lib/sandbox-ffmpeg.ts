import { Sandbox } from "@vercel/sandbox";

export interface SandboxClipRequest {
  startTime: number;
  endTime: number;
  assBase64: string;
}

type SandboxCreateParams = Parameters<typeof Sandbox.create>[0];

function getSandboxConfig(): SandboxCreateParams {
  const runtime = process.env.FFMPEG_SANDBOX_RUNTIME ?? "node22";
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  const creds =
    token && projectId && teamId
      ? { token, projectId, teamId }
      : {};

  return {
    runtime,
    ...creds,
  } as SandboxCreateParams;
}

async function runAndCheck(
  sandbox: Sandbox,
  command: string,
  args: string[],
  description: string
): Promise<string> {
  console.log(`[Sandbox] ${description}...`);
  const cmd = await sandbox.runCommand({
    cmd: command,
    args,
    detached: true,
  });
  const finished = await cmd.wait();
  const stdout = await cmd.stdout();
  const stderr = await cmd.stderr();
  const exitCode = finished.exitCode ?? 0;

  if (exitCode !== 0) {
    console.error(`[Sandbox] ${description} failed with exit code ${exitCode}`);
    console.error(`[Sandbox] stderr: ${stderr}`);
    console.error(`[Sandbox] stdout: ${stdout}`);
    throw new Error(`${description} failed: ${stderr || stdout}`);
  }

  console.log(`[Sandbox] ${description} completed`);
  return stdout;
}

async function ensureFfmpegInstalled(sandbox: Sandbox): Promise<void> {
  // Download static ffmpeg binary (works on any Linux)
  await runAndCheck(
    sandbox,
    "bash",
    ["-lc", `
      set -ex
      cd /tmp
      echo "Installing xz if needed..."
      sudo dnf -y install xz || sudo yum -y install xz || (sudo apt-get update && sudo apt-get install -y xz-utils)
      echo "Installing fonts..."
      sudo dnf -y install fontconfig dejavu-sans-fonts || sudo yum -y install fontconfig dejavu-sans-fonts || (sudo apt-get update && sudo apt-get install -y fontconfig fonts-dejavu-core)
      echo "Downloading ffmpeg..."
      curl -L -f -o ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
      echo "Extracting..."
      tar xf ffmpeg.tar.xz
      ls -la ffmpeg-*-amd64-static/
      echo "Installing to /usr/local/bin..."
      sudo cp ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ffmpeg
      sudo cp ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ffprobe
      sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
      ls -la /usr/local/bin/ffmpeg
      rm -rf ffmpeg.tar.xz ffmpeg-*-amd64-static
      echo "Done installing ffmpeg"
    `],
    "Install ffmpeg"
  );
  
  // Verify ffmpeg is available using full path
  await runAndCheck(sandbox, "bash", ["-lc", "/usr/local/bin/ffmpeg -version"], "Verify ffmpeg");
  await runAndCheck(sandbox, "bash", ["-lc", "/usr/local/bin/ffmpeg -filters | grep subtitles"], "Verify subtitles filter");
}

async function downloadVideo(sandbox: Sandbox, videoUrl: string): Promise<void> {
  await runAndCheck(
    sandbox,
    "curl",
    ["-L", "-f", "-o", "/tmp/input.mp4", "--", videoUrl],
    "Download video"
  );

  await runAndCheck(sandbox, "ls", ["-la", "/tmp/input.mp4"], "Verify downloaded video");
}

export async function extractAudioInSandbox(videoUrl: string): Promise<Buffer> {
  console.log("[Sandbox] Creating sandbox for audio extraction...");
  const sandbox = await Sandbox.create(getSandboxConfig());
  console.log(`[Sandbox] Sandbox created: ${sandbox.sandboxId}`);
  
  try {
    await ensureFfmpegInstalled(sandbox);
    await downloadVideo(sandbox, videoUrl);

    await runAndCheck(
      sandbox,
      "bash",
      ["-lc", "/usr/local/bin/ffmpeg -y -i /tmp/input.mp4 -vn -acodec mp3 /tmp/audio.mp3 && ls -la /tmp/audio.mp3"],
      "Extract audio"
    );

    const base64Audio = await runAndCheck(
      sandbox,
      "bash",
      ["-lc", "base64 -w 0 /tmp/audio.mp3"],
      "Encode audio to base64"
    );
    
    const buffer = Buffer.from(base64Audio.trim(), "base64");
    console.log(`[Sandbox] Audio buffer size: ${buffer.length} bytes`);
    return buffer;
  } finally {
    console.log("[Sandbox] Stopping sandbox...");
    await sandbox.stop().catch(() => {});
  }
}

export async function generateClipsInSandbox(
  videoUrl: string,
  clips: SandboxClipRequest[]
): Promise<Buffer[]> {
  console.log("[Sandbox] Creating sandbox for clip generation...");
  const sandbox = await Sandbox.create(getSandboxConfig());
  console.log(`[Sandbox] Sandbox created: ${sandbox.sandboxId}`);
  
  try {
    await ensureFfmpegInstalled(sandbox);
    await downloadVideo(sandbox, videoUrl);

    const outputs: Buffer[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const duration = clip.endTime - clip.startTime;
      const assPath = `/tmp/clip-${i}.ass`;
      const outPath = `/tmp/out-${i}.mp4`;

      await runAndCheck(
        sandbox,
        "bash",
        ["-lc", `echo '${clip.assBase64}' | base64 -d > ${assPath}`],
        `Write ASS file for clip ${i + 1}`
      );

      const ffmpegCmd = [
        "/usr/local/bin/ffmpeg -y",
        `-ss ${clip.startTime}`,
        `-t ${duration}`,
        "-i /tmp/input.mp4",
        `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,subtitles=${assPath}:original_size=1080x1920:fontsdir=/usr/share/fonts"`,
        "-c:v libx264",
        "-c:a aac",
        "-movflags +faststart",
        "-preset fast",
        outPath,
      ].join(" ");

      await runAndCheck(
        sandbox,
        "bash",
        ["-lc", `${ffmpegCmd} && ls -la ${outPath}`],
        `Generate clip ${i + 1}`
      );

      const clipBase64 = await runAndCheck(
        sandbox,
        "bash",
        ["-lc", `base64 -w 0 ${outPath}`],
        `Encode clip ${i + 1} to base64`
      );
      
      const buffer = Buffer.from(clipBase64.trim(), "base64");
      console.log(`[Sandbox] Clip ${i + 1} buffer size: ${buffer.length} bytes`);
      outputs.push(buffer);
    }

    return outputs;
  } finally {
    console.log("[Sandbox] Stopping sandbox...");
    await sandbox.stop().catch(() => {});
  }
}

export async function generateClipInSandbox(
  videoUrl: string,
  clip: SandboxClipRequest,
  clipIndex: number
): Promise<Buffer> {
  console.log(`[Sandbox] Creating sandbox for clip ${clipIndex + 1}...`);
  const sandbox = await Sandbox.create(getSandboxConfig());
  console.log(`[Sandbox] Sandbox created: ${sandbox.sandboxId}`);

  try {
    await ensureFfmpegInstalled(sandbox);
    await downloadVideo(sandbox, videoUrl);

    const duration = clip.endTime - clip.startTime;
    const assPath = `/tmp/clip-${clipIndex}.ass`;
    const outPath = `/tmp/out-${clipIndex}.mp4`;

    await runAndCheck(
      sandbox,
      "bash",
      ["-lc", `echo '${clip.assBase64}' | base64 -d > ${assPath}`],
      `Write ASS file for clip ${clipIndex + 1}`
    );

    const ffmpegCmd = [
      "/usr/local/bin/ffmpeg -y",
      `-ss ${clip.startTime}`,
      `-t ${duration}`,
      "-i /tmp/input.mp4",
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,subtitles=${assPath}:original_size=1080x1920:fontsdir=/usr/share/fonts"`,
      "-c:v libx264",
      "-c:a aac",
      "-movflags +faststart",
      "-preset fast",
      outPath,
    ].join(" ");

    await runAndCheck(
      sandbox,
      "bash",
      ["-lc", `${ffmpegCmd} && ls -la ${outPath}`],
      `Generate clip ${clipIndex + 1}`
    );

    const clipBase64 = await runAndCheck(
      sandbox,
      "bash",
      ["-lc", `base64 -w 0 ${outPath}`],
      `Encode clip ${clipIndex + 1} to base64`
    );

    const buffer = Buffer.from(clipBase64.trim(), "base64");
    console.log(`[Sandbox] Clip ${clipIndex + 1} buffer size: ${buffer.length} bytes`);
    return buffer;
  } finally {
    console.log(`[Sandbox] Stopping sandbox for clip ${clipIndex + 1}...`);
    await sandbox.stop().catch(() => {});
  }
}
