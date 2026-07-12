import { json, getGame, putGame, assignKey, proofKey, isBountyActive } from "../_shared.js";

// Guest-facing. Lets any active player OTHER than the bounty target's own
// assigned hunter catch the bounty for a reward, without disrupting the
// hunting chain: the bounty target's real hunter silently inherits their
// target exactly like a normal chain-elimination (no kill credit, since
// they didn't actually make the catch), the snatcher's own target and hunt
// are completely untouched, and the snatcher is rewarded with the identity
// of their own assassin - powerful, thematic, and doesn't reveal anyone
// else's pairing since it's information about themselves.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const token = request.headers.get("x-claim-token") || "";
  const proofPhotoDataUrl = body.proofPhotoDataUrl ? String(body.proofPhotoDataUrl) : null;
  const killCode = String(body.killCode || "").trim().toUpperCase();
  if (!name || !token) return json({ error: "Missing name or claim token." }, 400);
  if (!proofPhotoDataUrl || !proofPhotoDataUrl.startsWith("data:image/")) {
    return json({ error: "A proof photo of the catch is required." }, 400);
  }
  if (proofPhotoDataUrl.length > 2_000_000) {
    return json({ error: "Proof photo is too large - try a smaller image." }, 400);
  }
  if (!killCode) {
    return json({ error: "Enter the code from the back of their photo." }, 400);
  }

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);
  if (!isBountyActive(game)) return json({ error: "There's no active bounty right now." }, 400);

  const bountyName = game.players.find((p) => p.toLowerCase() === game.bountyTarget.toLowerCase());
  const snatcherName = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!snatcherName) return json({ error: "Unknown player." }, 404);
  if (snatcherName.toLowerCase() === bountyName.toLowerCase()) {
    return json({ error: "You can't snatch your own bounty." }, 400);
  }

  const snatcherKey = assignKey(snatcherName);
  const snatcherRaw = await env.ASSASSIN_KV.get(snatcherKey);
  if (!snatcherRaw) return json({ error: "Unknown player." }, 404);
  const snatcher = JSON.parse(snatcherRaw);

  if (snatcher.ownerToken !== token) return json({ error: "Unauthorized" }, 401);
  if (snatcher.status !== "active") {
    return json({ error: "Only active players can snatch a bounty." }, 400);
  }

  const bountyKey = assignKey(bountyName);
  const bountyRaw = await env.ASSASSIN_KV.get(bountyKey);
  if (!bountyRaw) return json({ error: "Bounty target record missing." }, 500);
  const bountyRecord = JSON.parse(bountyRaw);

  if (bountyRecord.status !== "active") {
    return json({ error: "The bounty target has already been eliminated." }, 400);
  }
  if (bountyRecord.immune) {
    return json({ error: "The bounty target is currently immune - try again later." }, 400);
  }
  if (!bountyRecord.killCode || killCode !== bountyRecord.killCode) {
    return json({ error: "That code doesn't match - check the back of the photo." }, 400);
  }

  // Find the bounty target's real assigned hunter (whoever's actual target
  // this is). If that happens to be the caller, this is just a normal
  // catch - the regular flow already handles it correctly and gives them
  // proper kill credit, so send them there instead of double-handling it.
  let assignedHunterName = null;
  let assignedHunterRecord = null;
  for (const p of game.players) {
    if (p.toLowerCase() === bountyName.toLowerCase()) continue;
    const raw = await env.ASSASSIN_KV.get(assignKey(p));
    if (!raw) continue;
    const rec = JSON.parse(raw);
    if (rec.status === "active" && rec.targetName?.toLowerCase() === bountyName.toLowerCase()) {
      assignedHunterName = p;
      assignedHunterRecord = rec;
      break;
    }
  }
  if (assignedHunterName && assignedHunterName.toLowerCase() === snatcherName.toLowerCase()) {
    return json({ error: "That's your actual target - use the normal \"I Got Them\" button instead." }, 400);
  }

  bountyRecord.status = "eliminated";
  bountyRecord.eliminatedBy = snatcherName;
  bountyRecord.eliminatedAt = Date.now();
  bountyRecord.following = snatcherName;
  await env.ASSASSIN_KV.put(bountyKey, JSON.stringify(bountyRecord));
  await env.ASSASSIN_KV.put(proofKey(bountyName), proofPhotoDataUrl);

  // Anyone documenting the bounty target gets redirected to the snatcher,
  // same cascade as a normal elimination.
  await Promise.all(
    game.players
      .filter((p) => p.toLowerCase() !== snatcherName.toLowerCase() && p.toLowerCase() !== bountyName.toLowerCase())
      .map(async (p) => {
        const key = assignKey(p);
        const raw = await env.ASSASSIN_KV.get(key);
        if (!raw) return;
        const rec = JSON.parse(raw);
        if (rec.status === "eliminated" && rec.following?.toLowerCase() === bountyName.toLowerCase()) {
          rec.following = snatcherName;
          await env.ASSASSIN_KV.put(key, JSON.stringify(rec));
        }
      })
  );

  // The chain stays intact: the real assigned hunter silently inherits
  // whoever the bounty target was hunting, exactly as if they'd made the
  // catch themselves - just without the kill credit, since they didn't.
  if (assignedHunterRecord) {
    const nextTarget = bountyRecord.targetName;
    if (nextTarget.toLowerCase() === assignedHunterName.toLowerCase()) {
      assignedHunterRecord.status = "won";
      assignedHunterRecord.targetName = null;
    } else {
      assignedHunterRecord.targetName = nextTarget;
    }
    await env.ASSASSIN_KV.put(assignKey(assignedHunterName), JSON.stringify(assignedHunterRecord));
  }

  // The snatcher's own hunt is untouched - only their kill count and a
  // one-time reward (learning their own assassin's identity) change.
  snatcher.kills = (snatcher.kills || 0) + 1;

  let reward = snatcher.knownAssassin || null;
  if (!reward) {
    for (const p of game.players) {
      if (p.toLowerCase() === snatcherName.toLowerCase()) continue;
      const raw = await env.ASSASSIN_KV.get(assignKey(p));
      if (!raw) continue;
      const rec = JSON.parse(raw);
      if (rec.status === "active" && rec.targetName?.toLowerCase() === snatcherName.toLowerCase()) {
        reward = p;
        break;
      }
    }
    snatcher.knownAssassin = reward;
  }
  await env.ASSASSIN_KV.put(snatcherKey, JSON.stringify(snatcher));

  await putGame(env, { ...game, bountyTarget: null, bountySetAt: null });

  return json({ ok: true, bountyEliminated: bountyName, knownAssassin: reward });
}
