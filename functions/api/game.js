import { json, getGame, putGame, requireAdmin } from "../_shared.js";

// Public: returns only the guest list + lock status + rigged names.
// Never contains anyone's actual target.
export async function onRequestGet({ env }) {
  const game = await getGame(env);
  if (!game) {
    return json({ players: [], locked: false, riggedHunter: "", riggedTarget: "" });
  }
  const { players, locked, riggedHunter, riggedTarget } = game;
  return json({ players, locked, riggedHunter, riggedTarget });
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

  await putGame(env, { players, riggedHunter, riggedTarget, locked: false });
  return json({ ok: true });
}
