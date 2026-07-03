import { json, getGame, assignKey, requireAdmin } from "../_shared.js";
import { generateKillCode } from "../../assassin/game-logic.js";

// Admin only. For a game that was locked before kill codes existed (or
// anyone somehow missing one) - assigns a fresh unique code to every player
// who doesn't already have one. Never touches targetName/status/photos, so
// it's safe to run on an in-progress game with existing claims.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const records = {};
  const usedCodes = new Set();
  for (const name of game.players) {
    const raw = await env.ASSASSIN_KV.get(assignKey(name));
    if (!raw) continue;
    const record = JSON.parse(raw);
    records[name] = record;
    if (record.killCode) usedCodes.add(record.killCode);
  }

  let assigned = 0;
  for (const [name, record] of Object.entries(records)) {
    if (record.killCode) continue;
    let code;
    do {
      code = generateKillCode();
    } while (usedCodes.has(code));
    usedCodes.add(code);
    record.killCode = code;
    await env.ASSASSIN_KV.put(assignKey(name), JSON.stringify(record));
    assigned++;
  }

  return json({ ok: true, assigned, total: Object.keys(records).length });
}
