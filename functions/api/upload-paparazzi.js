import { json, getGame, assignKey, paparazziKey } from "../_shared.js";

// Guest-facing. Lets an eliminated player upload a photo documenting the
// person they've been assigned to follow (see /api/eliminate's "following"
// field). The subject is always read from their own record server-side,
// never trusted from the client, so submissions can't be mislabeled.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const photoDataUrl = String(body.photoDataUrl || "");
  const token = request.headers.get("x-claim-token") || "";
  if (!name || !token) return json({ error: "Missing name or claim token." }, 400);
  if (!photoDataUrl.startsWith("data:image/")) {
    return json({ error: "Missing or invalid photo." }, 400);
  }
  if (photoDataUrl.length > 2_000_000) {
    return json({ error: "Photo is too large - try a smaller image." }, 400);
  }

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const key = assignKey(match);
  const raw = await env.ASSASSIN_KV.get(key);
  if (!raw) return json({ error: "Unknown player." }, 404);
  const record = JSON.parse(raw);
  if (record.ownerToken !== token) return json({ error: "Unauthorized" }, 401);
  if (record.status !== "eliminated" || !record.following) {
    return json({ error: "Only eliminated players with someone to follow can submit these." }, 400);
  }

  const id = crypto.randomUUID();
  const entry = {
    uploader: match,
    subject: record.following,
    photoDataUrl,
    submittedAt: Date.now(),
  };
  await env.ASSASSIN_KV.put(paparazziKey(id), JSON.stringify(entry));

  return json({ ok: true });
}
