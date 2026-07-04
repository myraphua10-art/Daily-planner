import { json, getGame, assignKey, paparazziKey } from "../_shared.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);

// Shared identity check for both the photo and video upload paths: must be
// an eliminated player with someone assigned to follow. Returns either
// {error: Response} or {match, record}.
async function validateUploader(env, name, token) {
  if (!name || !token) return { error: json({ error: "Missing name or claim token." }, 400) };

  const game = await getGame(env);
  if (!game || !game.locked) return { error: json({ error: "not-generated" }, 400) };
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return { error: json({ error: "Unknown player." }, 404) };

  const raw = await env.ASSASSIN_KV.get(assignKey(match));
  if (!raw) return { error: json({ error: "Unknown player." }, 404) };
  const record = JSON.parse(raw);
  if (record.ownerToken !== token) return { error: json({ error: "Unauthorized" }, 401) };
  if (record.status !== "eliminated" || !record.following) {
    return { error: json({ error: "Only eliminated players with someone to follow can submit these." }, 400) };
  }
  return { match, record };
}

// Guest-facing. Lets an eliminated player upload a photo or video documenting
// the person they've been assigned to follow (see /api/eliminate's
// "following" field). The subject is always read from their own record
// server-side, never trusted from the client, so submissions can't be
// mislabeled. Photos are small enough to keep in KV like other in-game
// photos; videos go to R2 as raw binary (uploaded directly as the request
// body, not base64) since they're too big for KV.
export async function onRequestPost({ request, env }) {
  const contentType = request.headers.get("content-type") || "";
  const token = request.headers.get("x-claim-token") || "";

  if (contentType.startsWith("video/")) {
    if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
      return json({ error: "Unsupported video format - try mp4 or mov." }, 400);
    }
    if (!env.PAPARAZZI_BUCKET) {
      return json({ error: "Video uploads aren't set up on the server yet." }, 503);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_VIDEO_BYTES) {
      return json({ error: "Video is too large - keep clips under 50MB." }, 400);
    }

    const name = String(request.headers.get("x-uploader-name") || "").trim();
    const result = await validateUploader(env, name, token);
    if (result.error) return result.error;

    const ext = contentType.split("/")[1] || "mp4";
    const id = crypto.randomUUID();
    const objectKey = `paparazzi-video/${id}.${ext}`;
    await env.PAPARAZZI_BUCKET.put(objectKey, request.body, {
      httpMetadata: { contentType },
    });

    const entry = {
      uploader: result.match,
      subject: result.record.following,
      videoKey: objectKey,
      submittedAt: Date.now(),
    };
    await env.ASSASSIN_KV.put(paparazziKey(id), JSON.stringify(entry));
    return json({ ok: true });
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  const photoDataUrl = String(body.photoDataUrl || "");
  if (!photoDataUrl.startsWith("data:image/")) {
    return json({ error: "Missing or invalid photo." }, 400);
  }
  if (photoDataUrl.length > 2_000_000) {
    return json({ error: "Photo is too large - try a smaller image." }, 400);
  }

  const result = await validateUploader(env, name, token);
  if (result.error) return result.error;

  const id = crypto.randomUUID();
  const entry = {
    uploader: result.match,
    subject: result.record.following,
    photoDataUrl,
    submittedAt: Date.now(),
  };
  await env.ASSASSIN_KV.put(paparazziKey(id), JSON.stringify(entry));

  return json({ ok: true });
}
