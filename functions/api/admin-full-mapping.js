import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only, for verification after a manual change (like removing a
// player) - not meant for casual use. Returns the full hunter -> target
// mapping for every player, which is exactly what the rest of this app is
// built to keep hidden from everyone, including the host, in normal play.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      if (!raw) return { name, targetName: null, status: "active" };
      const record = JSON.parse(raw);
      return { name, targetName: record.targetName, status: record.status };
    })
  );

  return json({ rows });
}
