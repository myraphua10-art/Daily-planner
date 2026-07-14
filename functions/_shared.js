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

// Accepts DD/MM (or DD-MM, DD.MM, single-digit day/month) and normalizes to
// a zero-padded "DD/MM" string, or null if it isn't a valid date shape.
export function normalizeBirthday(raw) {
  const m = String(raw || "").trim().match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
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

// Paparazzi documentation photos, one per submission (an eliminated player
// can submit many over time) - listed later via KV's prefix listing rather
// than a hand-maintained index, so concurrent uploads can't race each other.
export function paparazziKey(id) {
  return `paparazzi:${id}`;
}

// Snapshot of everything /api/remove-player changed, so /api/undo-remove-player
// can revert it - as long as nothing else has moved on in the meantime.
export function removalBackupKey(name) {
  return `removal-backup:${slugify(name)}`;
}

// Dinner order, keyed by player - overwritten on resubmit so there's always
// exactly one current answer per person instead of a scrolling thread.
export function menuKey(name) {
  return `menu:${slugify(name)}`;
}

export const MENU_OPTIONS = [
  { id: "paccheri", label: "Paccheri Pomodoro e Ricotta", desc: "datterino tomato sauce, ricotta, marjoram, orange zest" },
  { id: "rigatoni", label: "Rigatoni alla Carbonara", desc: "cured pork cheek, egg yolk, pecorino romano" },
  { id: "pappardelle", label: "Pappardelle al Ragù", desc: "hand-cut wagyu beef ragout, pepper berries, grana padano" },
  { id: "pollo", label: "Pollo e Peperoni", desc: "chicken breast alla diavola, stewed capsicum, taggiasca olives" },
];

// A bounty is only snatchable for a limited window after it's set - after
// that it quietly reverts to a normal target, same as if it were never
// flagged. Time-based rather than a plain flag, same pattern as every other
// "temporary status" in this app.
export const BOUNTY_DURATION_MS = 20 * 60 * 1000;

export function isBountyActive(game) {
  return Boolean(game?.bountyTarget && game?.bountySetAt && Date.now() - game.bountySetAt < BOUNTY_DURATION_MS);
}

export function effectiveBountyTarget(game) {
  return isBountyActive(game) ? game.bountyTarget : null;
}

// Shared shape for a hunter's reveal, whether they just claimed their name
// or are revisiting. Looks up the current target's photo (if that person has
// uploaded one yet) fresh each time, so it stays current as the chain shifts.
export async function buildReveal(env, record, token) {
  // Persistent, personal reward from a bounty snatch - the player's own
  // hunter's identity. Not a pairing leak: it's information about *them*,
  // shown regardless of their current active/eliminated/won status.
  const knownAssassin = record.knownAssassin || null;

  if (record.status === "eliminated") {
    // "following" is reassigned by /api/eliminate whenever the person they
    // were following also goes out, so it's always whoever is currently
    // still alive - read fresh rather than trusting a stale kill count.
    let following = null;
    if (record.following) {
      const followingRaw = await env.ASSASSIN_KV.get(assignKey(record.following));
      const followingRecord = followingRaw ? JSON.parse(followingRaw) : null;
      following = { name: record.following, kills: followingRecord?.kills || 0 };
    }
    return { eliminated: true, eliminatedBy: record.eliminatedBy, following, knownAssassin, claimToken: token };
  }
  if (record.status === "won") {
    return { won: true, knownAssassin, claimToken: token };
  }
  const targetPhoto = await env.ASSASSIN_KV.get(photoKey(record.targetName));
  return {
    targetName: record.targetName,
    targetPhoto: targetPhoto || null,
    knownAssassin,
    claimToken: token,
  };
}
