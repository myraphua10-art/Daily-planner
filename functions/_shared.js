import { slugify } from "../assassin/game-logic.js";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function requireAdmin(request, env) {
  const provided = (request.headers.get("x-admin-passcode") || "").trim();
  const expected = (env.ADMIN_PASSCODE || "").trim();
  return Boolean(expected) && provided === expected;
}

export async function getGame(env) {
  const raw = await env.ASSASSIN_KV.get("game");
  return raw ? JSON.parse(raw) : null;
}

export async function putGame(env, game) {
  await env.ASSASSIN_KV.put("game", JSON.stringify(game));
}

export function assignKey(name) {
  return `assign:${slugify(name)}`;
}
