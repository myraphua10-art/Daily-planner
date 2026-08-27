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

// The ordered list of forced hunter->target edges for cycle generation.
// Prefers the newer `riggedChain` array; falls back to the legacy
// hunter/target pair so older stored games keep working.
export function riggedChainFromGame(game) {
  if (Array.isArray(game?.riggedChain) && game.riggedChain.length) {
    return game.riggedChain;
  }
  return [game?.riggedHunter, game?.riggedTarget].filter((x) => x && String(x).trim());
}

export function photoKey(name) {
  return `photo:${slugify(name)}`;
}

// Proof-of-elimination photo, keyed by the person who got eliminated (each
// person can only be eliminated once, so this is unambiguous).
export function proofKey(name) {
  return `proof:${slugify(name)}`;
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

// Shared shape for a hunter's reveal, whether they just claimed their name
// or are revisiting. Looks up the current target's photo (if that person has
// uploaded one yet) fresh each time, so it stays current as the chain shifts.
export async function buildReveal(env, record, token, name) {
  if (record.status === "eliminated") {
    return {
      eliminated: true,
      eliminatedBy: record.eliminatedBy,
      recruitedBy: record.recruitedBy || null,
      claimToken: token,
    };
  }

  // A living hunter may recruit ONE person they've personally eliminated.
  // Both the current recruit and the still-available candidates are things
  // this player already knows (they made those kills), so returning them
  // leaks nothing about anyone else's pairing.
  const recruitInfo = await buildRecruitInfo(env, record, name);

  if (record.status === "won") {
    return { won: true, ...recruitInfo, claimToken: token };
  }
  const targetPhoto = await env.ASSASSIN_KV.get(photoKey(record.targetName));
  return {
    targetName: record.targetName,
    targetPhoto: targetPhoto || null,
    ...recruitInfo,
    claimToken: token,
  };
}

// { recruit, recruitable } for a living player: who they've already taken
// onto their team (at most one, ever) and which of their own victims are
// still free to be recruited.
export async function buildRecruitInfo(env, record, name) {
  if (!name) return { recruit: record.recruit || null, recruitable: [] };
  if (record.recruit) return { recruit: record.recruit, recruitable: [] };

  const game = await getGame(env);
  const others = (game?.players || []).filter((p) => p.toLowerCase() !== name.toLowerCase());
  const recruitable = [];
  for (const p of others) {
    const raw = await env.ASSASSIN_KV.get(assignKey(p));
    if (!raw) continue;
    const rec = JSON.parse(raw);
    if (
      rec.status === "eliminated" &&
      rec.eliminatedBy?.toLowerCase() === name.toLowerCase() &&
      !rec.recruitedBy
    ) {
      recruitable.push(p);
    }
  }
  return { recruit: null, recruitable };
}
