import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Clears ownership so someone can re-claim their name on a new
// device. Deliberately never reads/returns targetName in the response.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No game yet." }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const key = assignKey(match);
  const raw = await env.ASSASSIN_KV.get(key);
  if (!raw) return json({ error: "That player has no assignment yet." }, 404);

  const record = JSON.parse(raw);
  record.ownerToken = null;
  record.claimedAt = null;
  await env.ASSASSIN_KV.put(key, JSON.stringify(record));
  return json({ ok: true });
}
