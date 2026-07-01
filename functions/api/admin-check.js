import { json, requireAdmin } from "../_shared.js";

// Lets admin.html verify a typed passcode against the server-side secret
// before showing the setup panel, without the real passcode ever shipping
// in the page's JS.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  return json({ ok: true });
}
