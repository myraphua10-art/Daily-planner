import { json, getGame, putGame, requireAdmin, normalizeBirthday } from "../_shared.js";

// Admin only. Sets each player's birthday, used as a shared-knowledge check
// on first claim so one guest can't claim another guest's name. Works before
// or after the game is locked - it's identity metadata, not part of the
// cycle generation, so it doesn't touch players/riggedHunter/riggedTarget.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No guest list saved yet." }, 400);

  const body = await request.json();
  const entries = Array.isArray(body.birthdays) ? body.birthdays : [];
  const birthdays = { ...(game.birthdays || {}) };
  const errors = [];

  for (const entry of entries) {
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
    if (!match) {
      errors.push(`Unknown player: ${name}`);
      continue;
    }
    const normalized = normalizeBirthday(entry?.birthday);
    if (!normalized) {
      errors.push(`Invalid birthday for ${match} - use DD/MM.`);
      continue;
    }
    birthdays[match] = normalized;
  }

  await putGame(env, { ...game, birthdays });
  return json({ ok: true, count: Object.keys(birthdays).length, errors });
}
