import { json, getGame, assignKey, requireAdmin } from "../_shared.js";

// Admin only, and deliberately not linked from anywhere but the admin page
// itself. A one-at-a-time reverse lookup ("who is currently hunting X") for
// a host who has decided they want to peek - never dumps the full mapping.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  const match = game.players.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const raw = await env.ASSASSIN_KV.get(assignKey(match));
  if (!raw) return json({ error: "Unknown player." }, 404);
  const record = JSON.parse(raw);

  if (record.status === "eliminated") {
    return json({ eliminated: true, eliminatedBy: record.eliminatedBy });
  }
  if (record.status === "won") {
    return json({ won: true });
  }

  for (const p of game.players) {
    if (p.toLowerCase() === match.toLowerCase()) continue;
    const hraw = await env.ASSASSIN_KV.get(assignKey(p));
    if (!hraw) continue;
    const hrecord = JSON.parse(hraw);
    if (hrecord.status === "active" && hrecord.targetName.toLowerCase() === match.toLowerCase()) {
      return json({ hunter: p });
    }
  }

  return json({ error: "Could not find their hunter." }, 500);
}
