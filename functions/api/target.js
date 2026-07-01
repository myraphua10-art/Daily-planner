import { json, getGame, assignKey, buildReveal } from "../_shared.js";

// Guest-facing. Only works for a name that's already been claimed (via
// /api/claim, which also collects the guest's own photo) - the caller must
// present the same token they got back from that claim. Anyone else, or a
// request without the right token, is rejected before the target is ever
// included in a response.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) return json({ error: "Missing name." }, 400);

  const game = await getGame(env);
  if (!game || !game.locked) return json({ error: "not-generated" }, 400);
  if (!game.players.includes(name)) return json({ error: "Unknown player." }, 404);

  const key = assignKey(name);
  const raw = await env.ASSASSIN_KV.get(key);
  if (!raw) return json({ error: "Unknown player." }, 404);
  const record = JSON.parse(raw);

  if (!record.ownerToken) {
    return json({ error: "not-claimed" }, 400);
  }

  const providedToken = request.headers.get("x-claim-token") || "";
  if (providedToken === record.ownerToken) {
    const reveal = await buildReveal(env, record, record.ownerToken);
    return json(reveal);
  }

  return json({ error: "already-claimed" }, 409);
}
