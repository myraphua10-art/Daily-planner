import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Lists every player's kill code so the host can write it on
// the back of their laminated photo. Doesn't reveal any pairing info -
// just each person's own code, independent of who's hunting whom.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      if (!raw) return { name, killCode: null, status: "active" };
      const record = JSON.parse(raw);
      return { name, killCode: record.killCode || null, status: record.status };
    })
  );

  return json({ rows });
}
