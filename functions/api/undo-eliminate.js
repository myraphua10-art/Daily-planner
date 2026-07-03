import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Reverses a single elimination: the eliminated player goes
// back to "active" and the hunter goes back to hunting them directly.
// Only safe when the hunter hasn't moved on since (i.e. they haven't
// eliminated whoever they inherited as a result) - otherwise reverting
// would silently discard real chain progress, so this refuses and asks
// the host to sort it out manually instead.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No game yet." }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const targetKey = assignKey(match);
  const targetRaw = await env.ASSASSIN_KV.get(targetKey);
  if (!targetRaw) return json({ error: "Unknown player." }, 404);
  const targetRecord = JSON.parse(targetRaw);

  if (targetRecord.status !== "eliminated") {
    return json({ error: `${match} isn't currently marked as eliminated.` }, 400);
  }

  const hunterName = targetRecord.eliminatedBy;
  const hunterKey = assignKey(hunterName);
  const hunterRaw = await env.ASSASSIN_KV.get(hunterKey);
  if (!hunterRaw) return json({ error: "Could not find the hunter who eliminated them." }, 500);
  const hunter = JSON.parse(hunterRaw);

  const safeToUndo =
    hunter.status === "won" ||
    (hunter.status === "active" && hunter.targetName === targetRecord.targetName);

  if (!safeToUndo) {
    return json(
      {
        error: `Can't safely undo - ${hunterName} has already moved on since eliminating ${match}. You'll need to sort this out manually.`,
      },
      400
    );
  }

  hunter.status = "active";
  hunter.targetName = match;
  await env.ASSASSIN_KV.put(hunterKey, JSON.stringify(hunter));

  targetRecord.status = "active";
  targetRecord.eliminatedBy = null;
  targetRecord.eliminatedAt = null;
  await env.ASSASSIN_KV.put(targetKey, JSON.stringify(targetRecord));

  return json({ ok: true });
}
