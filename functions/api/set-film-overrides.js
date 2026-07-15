import { json, getGame, putGame, requireAdmin } from "../_shared.js";

// Admin only. By default, an eliminated player has to film whoever got them.
// This lets the host override that per player - e.g. two friends who want
// to film each other no matter who's actually eliminated first. Only takes
// effect while the override target is still in the game (active or won);
// once they're eliminated too, the normal rule takes back over.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No guest list saved yet." }, 400);

  const body = await request.json();
  const entries = Array.isArray(body.overrides) ? body.overrides : [];
  const filmOverrides = { ...(game.filmOverrides || {}) };
  const errors = [];

  for (const entry of entries) {
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
    if (!match) {
      errors.push(`Unknown player: ${name}`);
      continue;
    }

    const filmTargetRaw = String(entry?.filmTarget || "").trim();
    if (!filmTargetRaw) {
      delete filmOverrides[match];
      continue;
    }
    const filmMatch = game.players.find((p) => p.toLowerCase() === filmTargetRaw.toLowerCase());
    if (!filmMatch) {
      errors.push(`Unknown film target for ${match}: ${filmTargetRaw}`);
      continue;
    }
    if (filmMatch.toLowerCase() === match.toLowerCase()) {
      errors.push(`${match} can't be assigned to film themselves.`);
      continue;
    }
    filmOverrides[match] = filmMatch;
  }

  await putGame(env, { ...game, filmOverrides });
  return json({ ok: true, count: Object.keys(filmOverrides).length, errors });
}
