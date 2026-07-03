import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only - emergency use. Dumps the entire current hunter->target
// mapping in one call, meant for diagnosing/fixing a live game after a
// mistake, not for casual browsing.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      if (!raw) return { name, status: "unknown" };
      const record = JSON.parse(raw);
      return {
        name,
        status: record.status,
        targetName: record.status === "active" ? record.targetName : null,
        eliminatedBy: record.status === "eliminated" ? record.eliminatedBy : undefined,
        claimed: Boolean(record.ownerToken),
      };
    })
  );

  return json({ rows });
}
