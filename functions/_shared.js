import { slugify } from "../assassin/game-logic.js";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Falls back to a hardcoded passcode if the ADMIN_PASSCODE secret isn't
// configured on the Worker (e.g. dashboard secret setup didn't take), so
// the admin gate keeps working without depending on that being right.
// Change FALLBACK_PASSCODE to something private before sharing this repo further.
const FALLBACK_PASSCODE = "697294";

export function requireAdmin(request, env) {
  const provided = (request.headers.get("x-admin-passcode") || "").trim();
  const expected = (env.ADMIN_PASSCODE || FALLBACK_PASSCODE).trim();
  return provided === expected;
}

export async function getGame(env) {
  const raw = await env.ASSASSIN_KV.get("game");
  return raw ? JSON.parse(raw) : null;
}

export async function putGame(env, game) {
  await env.ASSASSIN_KV.put("game", JSON.stringify(game));
}

export function assignKey(name) {
  return `assign:${slugify(name)}`;
}

export function photoKey(name) {
  return `photo:${slugify(name)}`;
}

// Proof-of-elimination photo, keyed by the person who got eliminated (each
// person can only be eliminated once, so this is unambiguous).
export function proofKey(name) {
  return `proof:${slugify(name)}`;
}

// Shared shape for a hunter's reveal, whether they just claimed their name
// or are revisiting. Looks up the current target's photo (if that person has
// uploaded one yet) fresh each time, so it stays current as the chain shifts.
// Also reports whether the target is currently on a break - that's not new
// information for the hunter (they already know their own target's name),
// just a live status flag on someone they can already see.
export async function buildReveal(env, record, token) {
  if (record.status === "eliminated") {
    return { eliminated: true, eliminatedBy: record.eliminatedBy, claimToken: token };
  }
  if (record.status === "won") {
    return { won: true, claimToken: token };
  }
  const targetPhoto = await env.ASSASSIN_KV.get(photoKey(record.targetName));
  const targetRaw = await env.ASSASSIN_KV.get(assignKey(record.targetName));
  const targetOnBreak = targetRaw ? Boolean(JSON.parse(targetRaw).onBreak) : false;
  return {
    targetName: record.targetName,
    targetPhoto: targetPhoto || null,
    targetOnBreak,
    onBreak: Boolean(record.onBreak),
    claimToken: token,
  };
}
