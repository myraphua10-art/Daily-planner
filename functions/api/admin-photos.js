import { json, getGame, photoKey, requireAdmin } from "../_shared.js";

// Admin only. Lists every player's uploaded photo (or lack thereof) -
// deliberately separate from targetName/status, so this can't leak pairings.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No game yet." }, 400);

  const photos = await Promise.all(
    game.players.map(async (name) => {
      const photo = await env.ASSASSIN_KV.get(photoKey(name));
      return { name, photo: photo || null };
    })
  );

  return json({ photos });
}
