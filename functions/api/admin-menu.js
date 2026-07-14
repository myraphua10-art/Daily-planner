import { json, getGame, menuKey, requireAdmin, MENU_OPTIONS } from "../_shared.js";

// Admin only. A clean tally: each player's current order (or none yet) plus
// a per-dish count, so the host can see at a glance who hasn't answered
// instead of scrolling a group chat.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  const players = game?.players ?? [];

  const rows = await Promise.all(
    players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(menuKey(name));
      const entry = raw ? JSON.parse(raw) : null;
      return {
        name,
        main: entry?.main || null,
        allergies: entry?.allergies || "",
        submittedAt: entry?.submittedAt || null,
      };
    })
  );

  const counts = {};
  for (const opt of MENU_OPTIONS) counts[opt.id] = 0;
  for (const r of rows) {
    if (r.main && counts[r.main] != null) counts[r.main]++;
  }

  return json({ rows, counts, options: MENU_OPTIONS });
}
