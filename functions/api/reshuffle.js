import { json, getGame, putGame, requireAdmin, assignKey } from "../_shared.js";
import { generateAssassinCycle } from "../../assassin/game-logic.js";

// Admin only. Regenerates the whole hunting loop from scratch (still
// forcing the rigged pairing, e.g. Jayna -> Myra) WITHOUT resetting
// anyone's claim - for when pairings have leaked before the game starts.
// Each player keeps their ownerToken, photo, kill code, and status; only
// targetName changes. Like /api/generate, the new assignments are written
// straight to KV and never returned to the browser.
//
// Refuses to run once anyone has been eliminated: a mid-game reshuffle
// would break the elimination chain's meaning (kills, following, etc.).
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const records = {};
  for (const name of game.players) {
    const raw = await env.ASSASSIN_KV.get(assignKey(name));
    if (!raw) return json({ error: `Record missing for ${name}.` }, 500);
    records[name] = JSON.parse(raw);
  }

  const eliminated = game.players.filter((p) => records[p].status !== "active");
  if (eliminated.length) {
    return json(
      { error: `The game has already started (${eliminated.join(", ")} out) - reshuffling now would break the chain.` },
      400
    );
  }

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
        JSON.stringify({ ...records[hunter], targetName: target })
      )
    )
  );

  await putGame(env, { ...game, lockedAt: Date.now() });
  return json({ ok: true, count: Object.keys(assignments).length });
}
