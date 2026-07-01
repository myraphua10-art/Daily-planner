import { json, requireAdmin } from "../_shared.js";

// Lets admin.html verify a typed passcode against the server-side secret
// before showing the setup panel, without the real passcode ever shipping
// in the page's JS.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) {
    // Debug info only - lengths, never the actual values, so this can't
    // leak the passcode itself but tells us whether the secret is even
    // present on THIS Worker and roughly whether it matches in shape.
    const provided = (request.headers.get("x-admin-passcode") || "").trim();
    const expected = (env.ADMIN_PASSCODE || "").trim();
    return json(
      {
        error: "Unauthorized",
        debug: {
          secretIsSet: expected.length > 0,
          secretLength: expected.length,
          providedLength: provided.length,
        },
      },
      401
    );
  }
  return json({ ok: true });
}
