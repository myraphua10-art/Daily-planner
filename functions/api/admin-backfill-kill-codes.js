import { json, getGame, requireAdmin, assignKey } from "../_shared.js";
import { generateKillCode } from "../../assassin/game-logic.js";

// Admin only. Assigns a kill code to any player who doesn't already have
// one - safe to call repeatedly, since existing codes are left alone unless
// force is set. Exists so kill codes can be added to (or regenerated for) a
// game that was already generated, without touching anything else.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body.force);

  let assigned = 0;
  for (const name of game.players) {
    const key = assignKey(name);
    const raw = await env.ASSASSIN_KV.get(key);
    if (!raw) continue;
    const record = JSON.parse(raw);
    if (force || !record.killCode) {
      record.killCode = generateKillCode(name);
      await env.ASSASSIN_KV.put(key, JSON.stringify(record));
      assigned++;
    }
  }

  return json({ ok: true, assigned });
}
