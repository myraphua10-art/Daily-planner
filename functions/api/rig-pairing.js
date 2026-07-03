import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only. Forces `hunter` to target `target` in an already-locked,
// in-progress game, without disturbing anyone else's claim/photo/target.
//
// This is a node-relocation move on the cycle: hunter is removed from her
// current spot (her predecessor P gets reattached to hunter's old target Y)
// and reinserted directly before `target` (target's current predecessor X
// gets repointed to hunter instead). Relocating a single node within a
// cycle always keeps it a single cycle, regardless of where the two edges
// happen to sit relative to each other - unlike a naive edge swap, which
// can silently split the loop into two disconnected sub-loops.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json();
  const hunterInput = String(body.hunter || "").trim();
  const targetInput = String(body.target || "").trim();

  const hunter = game.players.find((p) => p.toLowerCase() === hunterInput.toLowerCase());
  const target = game.players.find((p) => p.toLowerCase() === targetInput.toLowerCase());
  if (!hunter) return json({ error: `"${hunterInput}" is not in the guest list.` }, 404);
  if (!target) return json({ error: `"${targetInput}" is not in the guest list.` }, 404);
  if (hunter.toLowerCase() === target.toLowerCase()) {
    return json({ error: "Hunter and target must be different people." }, 400);
  }

  const hunterRaw = await env.ASSASSIN_KV.get(assignKey(hunter));
  const targetRaw = await env.ASSASSIN_KV.get(assignKey(target));
  if (!hunterRaw || !targetRaw) return json({ error: "Could not find one of those players." }, 404);

  const hunterRecord = JSON.parse(hunterRaw);
  const targetRecord = JSON.parse(targetRaw);

  if (hunterRecord.status !== "active" || targetRecord.status !== "active") {
    return json(
      { error: "Both people must currently be active (not eliminated or already won) to safely rig this." },
      400
    );
  }

  if (hunterRecord.targetName.toLowerCase() === target.toLowerCase()) {
    return json({ ok: true, note: "Already the case - no change needed." });
  }

  const oldHunterTarget = hunterRecord.targetName;

  let predecessorOfHunterName = null;
  let predecessorOfTargetName = null;
  const records = {};

  for (const p of game.players) {
    const raw = await env.ASSASSIN_KV.get(assignKey(p));
    if (!raw) continue;
    const record = JSON.parse(raw);
    records[p] = record;
    if (record.targetName.toLowerCase() === hunter.toLowerCase()) predecessorOfHunterName = p;
    if (record.targetName.toLowerCase() === target.toLowerCase()) predecessorOfTargetName = p;
  }

  if (!predecessorOfHunterName || !predecessorOfTargetName) {
    return json({ error: "Could not resolve the current loop - refusing to risk breaking it." }, 500);
  }

  const predOfHunterRecord = records[predecessorOfHunterName];
  const predOfTargetRecord = records[predecessorOfTargetName];

  if (predOfHunterRecord.status !== "active" || predOfTargetRecord.status !== "active") {
    return json(
      {
        error:
          "The people currently hunting them must also be active (not eliminated) to safely rig this.",
      },
      400
    );
  }

  predOfHunterRecord.targetName = oldHunterTarget;
  await env.ASSASSIN_KV.put(assignKey(predecessorOfHunterName), JSON.stringify(predOfHunterRecord));

  hunterRecord.targetName = target;
  await env.ASSASSIN_KV.put(assignKey(hunter), JSON.stringify(hunterRecord));

  predOfTargetRecord.targetName = hunter;
  await env.ASSASSIN_KV.put(assignKey(predecessorOfTargetName), JSON.stringify(predOfTargetRecord));

  return json({ ok: true });
}
