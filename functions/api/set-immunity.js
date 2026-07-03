import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Grants or revokes immunity for one player - while immune,
// /api/eliminate refuses to let anyone eliminate them. Purely a live toggle,
// no expiry built in (host decides in person when to revoke it).
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  const immune = Boolean(body.immune);

  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const key = assignKey(match);
  const raw = await env.ASSASSIN_KV.get(key);
  if (!raw) return json({ error: "Unknown player." }, 404);
  const record = JSON.parse(raw);

  if (record.status !== "active") {
    return json({ error: "Only active players can be granted immunity." }, 400);
  }

  record.immune = immune;
  await env.ASSASSIN_KV.put(key, JSON.stringify(record));
  return json({ ok: true, name: match, immune });
}
