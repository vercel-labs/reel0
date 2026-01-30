import { handleUpload } from "@vercel/blob/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async () => {
      return {
        allowedContentTypes: ["video/*"],
        tokenPayload: JSON.stringify({
          intent: "video-upload",
        }),
      };
    },
  });

  return Response.json(result);
}
