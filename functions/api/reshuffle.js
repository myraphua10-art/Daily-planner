import { json, getGame, putGame, requireAdmin, assignKey, riggedChainFromGame } from "../_shared.js";
import { generateAssassinCycle } from "../../assassin/game-logic.js";

// Admin only. Regenerates the whole hunting loop from scratch (still
// forcing the rigged chain, e.g. Jayna -> Myra -> Qingyang) WITHOUT
// resetting anyone's claim - for when pairings have leaked before the game
// starts. Each player keeps their ownerToken, photo, kill code, and status;
// only targetName changes. Like /api/generate, the new assignments are
// written straight to KV and never returned to the browser.
//
// The forced chain can be passed in the request body (so it can be updated
// even on an already-locked game); it falls back to whatever's stored, and
// the effective chain is persisted back to the game object.
//
// Refuses to run once anyone has been eliminated: a mid-game reshuffle
// would break the elimination chain's meaning (kills, following, etc.).
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json().catch(() => ({}));
  const bodyChain = Array.isArray(body.riggedChain)
    ? body.riggedChain.map((n) => String(n || "").trim()).filter(Boolean)
    : null;
  const riggedChain = bodyChain && bodyChain.length ? bodyChain : riggedChainFromGame(game);

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
    assignments = generateAssassinCycle(game.players, riggedChain);
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

  // Persist the effective chain so later reshuffles keep it without needing
  // the body every time. riggedHunter/riggedTarget stay in sync as the first
  // two links for anything that still reads the legacy fields.
  await putGame(env, {
    ...game,
    riggedChain,
    riggedHunter: riggedChain[0] || "",
    riggedTarget: riggedChain[1] || "",
    lockedAt: Date.now(),
  });
  return json({ ok: true, count: Object.keys(assignments).length });
}
