import { json, getGame, requireAdmin, assignKey } from "../_shared.js";
import { generateKillCode } from "../../assassin/game-logic.js";

// Admin only. Assigns a kill code to any player who doesn't already have
// one - safe to call repeatedly, since existing codes are never touched.
// Exists so kill codes can be added to a game that was generated before
// this feature existed, without regenerating anything else.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  let assigned = 0;
  for (const name of game.players) {
    const key = assignKey(name);
    const raw = await env.ASSASSIN_KV.get(key);
    if (!raw) continue;
    const record = JSON.parse(raw);
    if (!record.killCode) {
      record.killCode = generateKillCode();
      await env.ASSASSIN_KV.put(key, JSON.stringify(record));
      assigned++;
    }
  }

  return json({ ok: true, assigned });
}
