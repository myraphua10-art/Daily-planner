import { json, getGame, assignKey } from "../_shared.js";

// Guest-facing. First call for a name claims it for this device (returns a
// fresh claim token to store locally). Later calls must present that same
// token to read the target again - anyone else, or a request without the
// right token, is rejected before the target is ever included in a response.
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

  const providedToken = request.headers.get("x-claim-token") || "";

  if (!record.ownerToken) {
    const token = crypto.randomUUID();
    record.ownerToken = token;
    record.claimedAt = Date.now();
    await env.ASSASSIN_KV.put(key, JSON.stringify(record));
    return json({ targetName: record.targetName, claimToken: token });
  }

  if (providedToken && providedToken === record.ownerToken) {
    return json({ targetName: record.targetName, claimToken: record.ownerToken });
  }

  return json({ error: "already-claimed" }, 409);
}
