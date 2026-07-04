import { json, getGame, assignKey, photoKey } from "../_shared.js";

// Guest-facing, self-service. Lets a player replace their own dossier photo
// at any point after claiming - authenticated with the same ownerToken they
// got from /api/claim, not a passcode. Whoever ends up hunting them will see
// whatever photo is stored at the time they load their reveal.
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

  await env.ASSASSIN_KV.put(photoKey(match), photoDataUrl);
  return json({ ok: true });
}
