import { json, getGame, assignKey, isOnBreak, BREAK_DURATION_MS } from "../_shared.js";

// Guest-facing, self-service (not admin). Lets a player mark themselves as
// temporarily safe - e.g. a toilet break - so their hunter can see it on
// their own reveal, and /api/eliminate refuses to let anyone eliminate them
// while it's active. Auto-expires after BREAK_DURATION_MS so nobody can
// leave it on indefinitely to dodge being caught.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const token = request.headers.get("x-claim-token") || "";
  if (!name || !token) return json({ error: "Missing name or claim token." }, 400);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const key = assignKey(match);
  const raw = await env.ASSASSIN_KV.get(key);
  if (!raw) return json({ error: "Unknown player." }, 404);
  const record = JSON.parse(raw);

  if (record.ownerToken !== token) return json({ error: "Unauthorized" }, 401);
  if (record.status !== "active") {
    return json({ error: "Only active players can toggle this." }, 400);
  }

  if (isOnBreak(record)) {
    record.onBreak = false;
    record.onBreakSince = null;
  } else {
    record.onBreak = true;
    record.onBreakSince = Date.now();
  }
  await env.ASSASSIN_KV.put(key, JSON.stringify(record));
  return json({
    ok: true,
    onBreak: record.onBreak,
    onBreakSince: record.onBreakSince,
    onBreakExpiresAt: record.onBreakSince ? record.onBreakSince + BREAK_DURATION_MS : null,
  });
}
