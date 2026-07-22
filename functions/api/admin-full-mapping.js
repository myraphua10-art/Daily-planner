import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only, and deliberately awkward to call: requires an explicit
// confirm flag on top of the passcode. This is the one endpoint that
// reveals the full hunter -> target mapping, kept as an emergency tool
// (e.g. verifying the game state if something seems broken on the day).
// Using it means the host now knows every pairing - including their own
// assassin - so the guest page's "not even Myra can see this" promise
// only holds as long as this stays unused.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return json({ error: "Missing confirmation." }, 400);
  }

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const rows = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      if (!raw) return { name, status: "missing", targetName: null };
      const record = JSON.parse(raw);
      return { name, status: record.status, targetName: record.targetName };
    })
  );

  return json({ rows });
}
