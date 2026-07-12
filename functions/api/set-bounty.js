import { json, getGame, putGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Sets (or clears) the public "bounty" target - shown on the
// status board and guest pages, and snatchable by anyone (not just their
// assigned hunter) via /api/snatch-bounty for a limited window. Doesn't
// touch anyone's actual assignment on its own.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json();
  const name = body.name ? String(body.name).trim() : null;

  if (!name) {
    await putGame(env, { ...game, bountyTarget: null, bountySetAt: null });
    return json({ ok: true, bountyTarget: null });
  }

  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const raw = await env.ASSASSIN_KV.get(assignKey(match));
  const record = raw ? JSON.parse(raw) : null;
  if (!record || record.status !== "active") {
    return json({ error: "Bounty target must currently be active." }, 400);
  }

  await putGame(env, { ...game, bountyTarget: match, bountySetAt: Date.now() });
  return json({ ok: true, bountyTarget: match });
}
