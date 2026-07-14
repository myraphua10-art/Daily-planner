import { json, getGame, menuKey } from "../_shared.js";

// Guest-facing. Lets the form prefill someone's own previous order when
// they pick their name again, so re-opening the page shows what they
// already chose instead of a blank form.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) return json({ error: "Missing name." }, 400);

  const game = await getGame(env);
  const match = game?.players?.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Unknown player." }, 404);

  const raw = await env.ASSASSIN_KV.get(menuKey(match));
  const entry = raw ? JSON.parse(raw) : null;
  return json({ main: entry?.main || null, allergies: entry?.allergies || "" });
}
