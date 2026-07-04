import { requireAdmin } from "../_shared.js";

// Admin only. Streams a video's bytes straight from R2 so the admin gallery
// can preview/download it without ever inlining large video data into a
// JSON response. The key is restricted to the paparazzi-video/ prefix as a
// cheap guard against being used to fetch arbitrary bucket contents.
export async function onRequestGet({ request, env }) {
  if (!requireAdmin(request, env)) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!key.startsWith("paparazzi-video/")) return new Response("Not found", { status: 404 });

  if (!env.PAPARAZZI_BUCKET) return new Response("Video storage isn't set up.", { status: 503 });
  const object = await env.PAPARAZZI_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "video/mp4",
      "content-length": String(object.size),
    },
  });
}
