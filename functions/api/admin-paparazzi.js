import { json, requireAdmin } from "../_shared.js";

// Admin only. Lists every paparazzi submission (who submitted it, who it's
// documenting, when) for the host to browse and download. Uses KV's prefix
// listing rather than a hand-maintained index, so concurrent uploads from
// different guests can't clobber each other.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const listResult = await env.ASSASSIN_KV.list({ prefix: "paparazzi:" });
  const entries = await Promise.all(
    listResult.keys.map(async (k) => {
      const raw = await env.ASSASSIN_KV.get(k.name);
      return raw ? JSON.parse(raw) : null;
    })
  );

  const valid = entries.filter(Boolean).sort((a, b) => b.submittedAt - a.submittedAt);
  return json({ entries: valid });
}
