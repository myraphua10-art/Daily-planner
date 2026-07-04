import { json, getGame, putGame, requireAdmin, assignKey } from "../_shared.js";
import { generateAssassinCycle } from "../../assassin/game-logic.js";

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
          kills: 0,
          following: null,
        })
      )
    )
  );

  await putGame(env, { ...game, locked: true });
  return json({ ok: true, count: Object.keys(assignments).length });
}
