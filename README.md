<p align="center">
  <img src="public/dark-logo.png" alt="Reel0" width="120" />
</p>

<h3 align="center">You can just clip things</h3>

---

Reel0 is an AI-powered video processing tool that automatically identifies and extracts the most engaging clips from long-form videos. Upload a video, and Reel0 will analyze the content to find viral-worthy moments.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  Frontend                                    │
│                           (Next.js App Router)                               │
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│   │  Home Page  │    │  Pipeline   │    │   Sidebar   │                      │
│   │  (Upload)   │───▶│    Page     │◀───│  (History)  │                      │
│   └─────────────┘    └─────────────┘    └─────────────┘                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Vercel Workflow (Orchestrator)                       │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 1: Upload                                                       │   │
│   │ Video ───────────────────────────▶ Vercel Blob Storage               │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 2: Extract Audio                                                │   │
│   │ Vercel Sandbox (FFmpeg) ─────────▶ Convert video to audio            │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 3: Transcribe                                                   │   │
│   │ Deepgram API ────────────────────▶ Audio to text with timestamps     │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 4: Analyze                                                      │   │
│   │ AI SDK (Claude/GPT) ─────────────▶ Find viral moments in transcript  │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 5: Extract Clips (Parallel)                                     │   │
│   │                                                                      │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│   │   │  Sandbox 1   │  │  Sandbox 2   │  │  Sandbox N   │               │   │
│   │   │   (FFmpeg)   │  │   (FFmpeg)   │  │   (FFmpeg)   │               │   │
│   │   │    Clip 1    │  │    Clip 2    │  │    Clip N    │               │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘               │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Step 6: Store                                                        │   │
│   │ Processed clips ─────────────────▶ Vercel Blob Storage               │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Video Upload**: User uploads a long-form video which is stored in Vercel Blob Storage.

2. **Audio Extraction**: A Vercel Sandbox running FFmpeg extracts the audio track from the video file.

3. **Transcription**: The extracted audio is sent to Deepgram for transcription, returning text with precise timestamps.

4. **AI Analysis**: Using the AI SDK, the transcript is analyzed by Claude/GPT to identify the most engaging, viral-worthy moments based on user-defined criteria.

5. **Parallel Clip Extraction**: Multiple Vercel Sandboxes are spun up in parallel, each running FFmpeg to extract a specific clip at the identified timestamps. This enables fast processing of multiple clips simultaneously.

6. **Delivery**: Processed clips are stored in Vercel Blob and displayed to the user for preview and download.

All steps are orchestrated by **Vercel Workflow**, which manages the pipeline execution, handles retries, and tracks progress.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

| Variable | Description |
|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob Storage token for storing videos and clips |
| `VERCEL_OIDC_TOKEN` | Vercel OIDC token for Sandbox authentication |
| `DEEPGRAM_API_KEY` | Deepgram API key for audio transcription |
| `AI_GATEWAY_API_KEY` | AI Gateway API key for accessing AI models |

```bash
# .env.local
BLOB_READ_WRITE_TOKEN=your_blob_token
VERCEL_OIDC_TOKEN=your_oidc_token
DEEPGRAM_API_KEY=your_deepgram_key
AI_GATEWAY_API_KEY=your_ai_gateway_key
```

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables (see above)

4. Run the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Orchestration**: Vercel Workflow
- **Styling**: Tailwind CSS + shadcn/ui
- **Storage**: Vercel Blob
- **Transcription**: Deepgram
- **AI**: AI SDK with Claude/GPT
- **Video Processing**: FFmpeg via Vercel Sandbox (parallel execution)
- **Animations**: Framer Motion

## Deploy on Vercel

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel-labs/video-processing-workflow)

Make sure to configure the environment variables in your Vercel project settings.
