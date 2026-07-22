import { json, getGame, putGame, requireAdmin } from "../_shared.js";

// Public fields only: guest list, lock status. NEVER riggedHunter/
// riggedTarget here - those reveal a pairing and must only go to an
// authenticated admin request (see the requireAdmin branch below).
export async function onRequestGet({ request, env }) {
  const game = await getGame(env);
  const base = {
    players: game?.players ?? [],
    locked: game?.locked ?? false,
  };

  if (requireAdmin(request, env)) {
    return json({
      ...base,
      riggedHunter: game?.riggedHunter ?? "",
      riggedTarget: game?.riggedTarget ?? "",
      riggedChain: game?.riggedChain ?? [],
      birthdays: game?.birthdays ?? {},
      filmOverrides: game?.filmOverrides ?? {},
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

  // Prefer an ordered riggedChain if given; fall back to the legacy
  // hunter/target pair. Store both so either reader stays happy.
  const chain = Array.isArray(body.riggedChain)
    ? body.riggedChain.map((n) => String(n || "").trim()).filter(Boolean)
    : [String(body.riggedHunter || "").trim(), String(body.riggedTarget || "").trim()].filter(Boolean);

  const riggedHunter = chain[0] || "";
  const riggedTarget = chain[1] || "";

  await putGame(env, { ...existing, players, riggedChain: chain, riggedHunter, riggedTarget, locked: false });
  return json({ ok: true });
}
