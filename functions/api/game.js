import { json, getGame, putGame, requireAdmin } from "../_shared.js";

// Public fields only: guest list, lock status, bounty. NEVER riggedHunter/
// riggedTarget here - those reveal a pairing and must only go to an
// authenticated admin request (see the requireAdmin branch below).
export async function onRequestGet({ request, env }) {
  const game = await getGame(env);
  const base = {
    players: game?.players ?? [],
    locked: game?.locked ?? false,
    bountyTarget: game?.bountyTarget ?? null,
  };

  if (requireAdmin(request, env)) {
    return json({
      ...base,
      riggedHunter: game?.riggedHunter ?? "",
      riggedTarget: game?.riggedTarget ?? "",
      birthdays: game?.birthdays ?? {},
    });
  }

  return json(base);
}

// Admin only: save/edit the guest list before generation.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const existing = await getGame(env);
  if (existing?.locked) return json({ error: "Game is already locked." }, 400);

  const body = await request.json();
  const players = Array.isArray(body.players) ? body.players.map(String) : [];
  if (players.length < 3) return json({ error: "Need at least 3 players." }, 400);

  const riggedHunter = String(body.riggedHunter || "").trim();
  const riggedTarget = String(body.riggedTarget || "").trim();

  await putGame(env, { ...existing, players, riggedHunter, riggedTarget, locked: false });
  return json({ ok: true });
}
