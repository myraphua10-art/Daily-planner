import { json, getGame, assignKey, proofKey } from "../_shared.js";

// Guest-facing. Reports that the caller (proven via their own claim token)
// eliminated their current target. The eliminated player is marked out, and
// the caller inherits whoever their target was hunting - the classic
// Assassin chain. If that loops back to the caller themselves, they've won.
// A proof photo of the catch is required (for the host to consider for
// bonus gifts) - no photo, no elimination.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const token = request.headers.get("x-claim-token") || "";
  const proofPhotoDataUrl = body.proofPhotoDataUrl ? String(body.proofPhotoDataUrl) : null;
  if (!name || !token) return json({ error: "Missing name or claim token." }, 400);
  if (!proofPhotoDataUrl || !proofPhotoDataUrl.startsWith("data:image/")) {
    return json({ error: "A proof photo of the catch is required." }, 400);
  }
  if (proofPhotoDataUrl.length > 2_000_000) {
    return json({ error: "Proof photo is too large - try a smaller image." }, 400);
  }

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const hunterKey = assignKey(match);
  const hunterRaw = await env.ASSASSIN_KV.get(hunterKey);
  if (!hunterRaw) return json({ error: "Unknown player." }, 404);
  const hunter = JSON.parse(hunterRaw);

  if (hunter.ownerToken !== token) return json({ error: "Unauthorized" }, 401);
  if (hunter.status === "eliminated") {
    return json({ error: "You've been eliminated - you can't hunt anymore." }, 400);
  }
  if (hunter.status === "won") return json({ error: "You already won!" }, 400);

  const targetKey = assignKey(hunter.targetName);
  const targetRaw = await env.ASSASSIN_KV.get(targetKey);
  if (!targetRaw) return json({ error: "Target record missing." }, 500);
  const targetRecord = JSON.parse(targetRaw);

  if (targetRecord.status === "eliminated") {
    return json({ error: "That target has already been eliminated." }, 400);
  }
  if (targetRecord.immune) {
    return json({ error: "Your target is currently immune - try again later." }, 400);
  }
  if (targetRecord.onBreak) {
    return json({ error: "Your target is on a break right now - try again in a bit." }, 400);
  }

  targetRecord.status = "eliminated";
  targetRecord.eliminatedBy = match;
  targetRecord.eliminatedAt = Date.now();
  await env.ASSASSIN_KV.put(targetKey, JSON.stringify(targetRecord));
  await env.ASSASSIN_KV.put(proofKey(hunter.targetName), proofPhotoDataUrl);

  const nextTarget = targetRecord.targetName;

  if (nextTarget.toLowerCase() === match.toLowerCase()) {
    hunter.status = "won";
    hunter.targetName = null;
    await env.ASSASSIN_KV.put(hunterKey, JSON.stringify(hunter));
    return json({ won: true });
  }

  hunter.targetName = nextTarget;
  await env.ASSASSIN_KV.put(hunterKey, JSON.stringify(hunter));
  return json({ ok: true, newTarget: nextTarget });
}
