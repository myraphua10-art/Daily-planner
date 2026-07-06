import { json, getGame, putGame, requireAdmin, assignKey, photoKey, proofKey } from "../_shared.js";

// Admin only. Cleanly removes one player from an already-locked game by
// splicing them out of the hunting cycle: whoever was hunting them inherits
// whoever they were hunting, exactly like the chain-elimination mechanic,
// but without anyone actually being caught. Every other pairing is
// completely untouched - whether that guest has already claimed their name
// or not, their own target never changes. The only unavoidable change is
// the removed player's own hunter, who silently gets a new target.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);
  if (game.players.length <= 3) {
    return json({ error: "Need at least 3 players remaining - can't remove." }, 400);
  }

  const removedKey = assignKey(match);
  const removedRaw = await env.ASSASSIN_KV.get(removedKey);
  if (!removedRaw) return json({ error: "Unknown player." }, 404);
  const removed = JSON.parse(removedRaw);

  if (removed.status === "won") {
    return json({ error: "That player already won - nothing to remove." }, 400);
  }

  const others = game.players.filter((p) => p.toLowerCase() !== match.toLowerCase());

  // Whoever should now be documented in the removed player's place: their
  // own hunter if they were still active (that person is "continuing the
  // story"), or whoever eliminated them if they'd already been caught.
  let redirectFollowersTo = removed.status === "eliminated" ? removed.eliminatedBy : null;

  if (removed.status === "active") {
    for (const p of others) {
      const raw = await env.ASSASSIN_KV.get(assignKey(p));
      if (!raw) continue;
      const rec = JSON.parse(raw);
      if (rec.status === "active" && rec.targetName?.toLowerCase() === match.toLowerCase()) {
        rec.targetName = removed.targetName;
        await env.ASSASSIN_KV.put(assignKey(p), JSON.stringify(rec));
        redirectFollowersTo = p;
        break;
      }
    }
  }

  // Anyone documenting the removed player (because the removed player had
  // eliminated them earlier, whether or not the removed player was ever
  // caught themselves) gets pointed at redirectFollowersTo instead, so the
  // chain isn't left dangling on someone who no longer exists.
  if (redirectFollowersTo) {
    for (const p of others) {
      const raw = await env.ASSASSIN_KV.get(assignKey(p));
      if (!raw) continue;
      const rec = JSON.parse(raw);
      if (rec.status === "eliminated" && rec.following?.toLowerCase() === match.toLowerCase()) {
        rec.following = redirectFollowersTo;
        await env.ASSASSIN_KV.put(assignKey(p), JSON.stringify(rec));
      }
    }
  }

  await env.ASSASSIN_KV.delete(removedKey);
  await env.ASSASSIN_KV.delete(photoKey(match));
  await env.ASSASSIN_KV.delete(proofKey(match));

  const birthdays = { ...(game.birthdays || {}) };
  delete birthdays[match];
  const bountyTarget = game.bountyTarget?.toLowerCase() === match.toLowerCase() ? null : game.bountyTarget;

  await putGame(env, { ...game, players: others, birthdays, bountyTarget });

  return json({ ok: true, removed: match });
}
