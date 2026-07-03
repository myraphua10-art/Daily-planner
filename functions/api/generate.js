import { json, getGame, putGame, requireAdmin, assignKey } from "../_shared.js";
import { generateAssassinCycle, generateKillCode } from "../../assassin/game-logic.js";

// Admin only. Runs entirely on Cloudflare's servers - the resulting
// assignments are written straight to KV and are never returned in this
// response or logged, so they never appear in the host's browser either.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No guest list saved yet." }, 400);
  if (game.locked) return json({ error: "Already locked." }, 400);

  let assignments;
  try {
    assignments = generateAssassinCycle(game.players, game.riggedHunter, game.riggedTarget);
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  // Every player gets a unique verification code to write on the back of
  // their printed photo/polaroid - whoever eliminates them has to enter it,
  // proving they actually got the right photo rather than just claiming so.
  const usedCodes = new Set();
  const killCodes = {};
  for (const player of game.players) {
    let code;
    do {
      code = generateKillCode();
    } while (usedCodes.has(code));
    usedCodes.add(code);
    killCodes[player] = code;
  }

  await Promise.all(
    Object.entries(assignments).map(([hunter, target]) =>
      env.ASSASSIN_KV.put(
        assignKey(hunter),
        JSON.stringify({
          targetName: target,
          ownerToken: null,
          claimedAt: null,
          status: "active",
          eliminatedBy: null,
          eliminatedAt: null,
          immune: false,
          killCode: killCodes[hunter],
        })
      )
    )
  );

  await putGame(env, { ...game, locked: true });
  return json({ ok: true, count: Object.keys(assignments).length });
}
