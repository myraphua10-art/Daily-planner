import { json, getGame, menuKey, MENU_OPTIONS } from "../_shared.js";

// Guest-facing, no token required - a dinner order isn't sensitive the way
// a target pairing is. Resubmitting just overwrites the previous entry, so
// there's always exactly one current answer per person instead of a
// scrolling WhatsApp thread nobody can tally.
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const mainId = String(body.main || "").trim();
  const allergies = String(body.allergies || "").trim().slice(0, 300);

  const game = await getGame(env);
  const match = game?.players?.find((p) => p.toLowerCase() === name.toLowerCase());
  if (!match) return json({ error: "Select your name from the list." }, 400);

  const option = MENU_OPTIONS.find((o) => o.id === mainId);
  if (!option) return json({ error: "Pick a main course." }, 400);

  await env.ASSASSIN_KV.put(
    menuKey(match),
    JSON.stringify({ main: option.id, allergies, submittedAt: Date.now() })
  );

  return json({ ok: true });
}
