import { json, getGame, assignKey, photoKey, buildReveal } from "../_shared.js";

// Guest-facing. First-time claim of a name: requires a photo of the person
// themselves, which gets shown later to whoever ends up hunting them. Fails
// if the name was already claimed on another device.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const photoDataUrl = String(body.photoDataUrl || "");

  if (!name) return json({ error: "Missing name." }, 400);
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

  if (record.ownerToken) return json({ error: "already-claimed" }, 409);

  const token = crypto.randomUUID();
  record.ownerToken = token;
  record.claimedAt = Date.now();
  await env.ASSASSIN_KV.put(key, JSON.stringify(record));
  await env.ASSASSIN_KV.put(photoKey(match), photoDataUrl);

  const reveal = await buildReveal(env, record, token);
  return json(reveal);
}
