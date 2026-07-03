import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Lists every player's verification code, so the host can write
// each one on the back of that person's printed photo/polaroid before the
// party. Codes are per-person (not per-pairing), so this doesn't reveal who
// is hunting whom.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      const record = raw ? JSON.parse(raw) : null;
      return { name, killCode: record?.killCode || null };
    })
  );

  return json({ rows });
}
