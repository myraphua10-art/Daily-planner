import { json, getGame, assignKey, proofKey, requireAdmin } from "../_shared.js";

// Admin only. Lists every eliminated player's proof-of-catch photo (required
// at elimination time) alongside who got them, so the host can decide who
// earns bonus gifts. Doesn't touch anyone's current target.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = [];
  for (const name of game.players) {
    const raw = await env.ASSASSIN_KV.get(assignKey(name));
    if (!raw) continue;
    const record = JSON.parse(raw);
    if (record.status !== "eliminated") continue;
    const proofPhoto = await env.ASSASSIN_KV.get(proofKey(name));
    rows.push({ name, eliminatedBy: record.eliminatedBy, proofPhoto: proofPhoto || null });
  }

  return json({ rows });
}
