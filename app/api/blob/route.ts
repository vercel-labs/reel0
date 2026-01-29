import { handleUpload } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleUpload(request, {
    onBeforeGenerateToken: async () => {
      return {
        allowedContentTypes: ["video/*"],
        tokenPayload: JSON.stringify({
          intent: "video-upload",
        }),
      };
    },
  });
}
