import { json, getGame, assignKey } from "../_shared.js";

// Guest-facing. A living player may take ONE person they personally
// eliminated onto their team - ever, no matter how many they catch. The
// recruit stays "eliminated" (their tag is gone, they can never snatch);
// this only records the alliance so the status board can show it and so
// the recruit falls with their recruiter.
//
// Only the recruiter's own victims are eligible, so this can't be used to
// learn anything about pairings the caller doesn't already know.
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const recruitName = String(body.recruit || "").trim();
  const token = request.headers.get("x-claim-token") || "";
  if (!name || !token) return json({ error: "Missing name or claim token." }, 400);
  if (!recruitName) return json({ error: "Pick someone to recruit." }, 400);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  const target = game.players.find((p) => p.toLowerCase() === recruitName.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);
  if (!target) return json({ error: "Unknown recruit." }, 404);
  if (match.toLowerCase() === target.toLowerCase()) {
    return json({ error: "You can't recruit yourself." }, 400);
  }

  const recruiterKey = assignKey(match);
  const recruiterRaw = await env.ASSASSIN_KV.get(recruiterKey);
  if (!recruiterRaw) return json({ error: "Unknown player." }, 404);
  const recruiter = JSON.parse(recruiterRaw);

  if (recruiter.ownerToken !== token) return json({ error: "Unauthorized" }, 401);
  if (recruiter.status === "eliminated") {
    return json({ error: "You've been eliminated - you can't recruit anymore." }, 400);
  }
  if (recruiter.recruit) {
    return json({ error: `You already recruited ${recruiter.recruit}. You only get one.` }, 400);
  }

  const recruitKey = assignKey(target);
  const recruitRaw = await env.ASSASSIN_KV.get(recruitKey);
  if (!recruitRaw) return json({ error: "Unknown recruit." }, 404);
  const recruitRecord = JSON.parse(recruitRaw);

  if (recruitRecord.status !== "eliminated") {
    return json({ error: "You can only recruit someone you've already eliminated." }, 400);
  }
  if (recruitRecord.eliminatedBy?.toLowerCase() !== match.toLowerCase()) {
    return json({ error: "You can only recruit someone YOU eliminated." }, 400);
  }
  if (recruitRecord.recruitedBy) {
    return json({ error: `${target} is already on someone's team.` }, 400);
  }

  recruiter.recruit = target;
  recruitRecord.recruitedBy = match;
  recruitRecord.recruitedAt = Date.now();
  await env.ASSASSIN_KV.put(recruiterKey, JSON.stringify(recruiter));
  await env.ASSASSIN_KV.put(recruitKey, JSON.stringify(recruitRecord));

  return json({ ok: true, recruit: target });
}
