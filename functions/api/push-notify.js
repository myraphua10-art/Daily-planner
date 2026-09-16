// Endpoints the planner and its service worker use for reminders.
//
//   POST /api/push-subscribe        register this device (or unregister it)
//   POST /api/pending-notification  service worker asking "what should I show?"
//   POST /api/push-test             send one notification right now
//
// A subscription is stored against the SHA-256 of the sync code — the same key
// the planner document lives under — so the cron job can read the calendar
// without the raw code ever being written down.

import { sha256hex, subKey, pendingKey, queueAndTickle, runReminders } from "../reminders.js";

function cors(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    ...extra,
  };
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ "content-type": "application/json" }),
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return null;
  }
}

const VALID_CODE = /^[a-z0-9-]{8,64}$/;

// Only real push endpoints — stops this being used to fire requests at
// arbitrary hosts.
const PUSH_HOSTS = [
  "push.services.mozilla.com",
  "web.push.apple.com",
  "fcm.googleapis.com",
  "notify.windows.com",
  "wns2-", // Windows regional endpoints
];

function endpointAllowed(endpoint, env) {
  let url;
  try {
    url = new URL(endpoint);
  } catch (err) {
    return false;
  }
  if (url.protocol !== "https:") {
    // A plain-http endpoint is only ever a local test harness.
    return Boolean(env.ALLOW_TEST_PUSH_ENDPOINT) && url.hostname === "localhost";
  }
  return PUSH_HOSTS.some((h) => url.hostname.includes(h));
}

export async function onRequestPost({ request, env }) {
  const path = new URL(request.url).pathname;
  const body = await readJson(request);
  if (!body) return reply({ error: "Bad request." }, 400);

  if (path.endsWith("/pending-notification")) {
    // The service worker knows its own endpoint; nobody else does, so that is
    // what authorises the read.
    const endpoint = String(body.endpoint || "");
    if (!endpoint) return reply({ error: "Missing endpoint." }, 400);
    const hash = await sha256hex(endpoint);
    const key = pendingKey(hash);
    const pending = JSON.parse((await env.ASSASSIN_KV.get(key)) || "[]");
    if (pending.length) await env.ASSASSIN_KV.delete(key);
    return reply({ notifications: pending });
  }

  const code = String(body.code || "").trim();
  if (!VALID_CODE.test(code)) return reply({ error: "Invalid sync code." }, 400);

  const sub = body.subscription || {};
  const endpoint = String(sub.endpoint || body.endpoint || "");
  if (!endpointAllowed(endpoint, env)) return reply({ error: "Not a valid push endpoint." }, 400);

  const hash = await sha256hex(endpoint);
  const docKey = `planner-sync:${await sha256hex(`planner:${code}`)}`;

  if (path.endsWith("/push-test")) {
    const rec = JSON.parse((await env.ASSASSIN_KV.get(subKey(hash))) || "null");
    if (!rec) return reply({ error: "This device isn't registered for reminders yet." }, 404);
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      return reply({ error: "Reminders aren't set up on the server — the VAPID keys are missing." }, 503);
    }
    const status = await queueAndTickle(env, rec, [
      { title: "Reminders are working", body: "This is what an exam reminder will look like." },
    ]);
    if (status === 0) return reply({ error: "Could not reach the push service." }, 502);
    if (status >= 400) return reply({ error: `Push service said ${status}.` }, 502);
    return reply({ ok: true, status });
  }

  // /api/push-subscribe
  if (body.unsubscribe) {
    await env.ASSASSIN_KV.delete(subKey(hash));
    await env.ASSASSIN_KV.delete(pendingKey(hash));
    return reply({ ok: true, subscribed: false });
  }

  const tz = String(body.tz || "UTC").slice(0, 64);
  await env.ASSASSIN_KV.put(
    subKey(hash),
    JSON.stringify({ hash, endpoint, docKey, tz, updatedAt: Date.now() })
  );
  return reply({ ok: true, subscribed: true, configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) });
}

// Lets the cron job be triggered by hand while testing. Guarded by the same
// admin passcode as the rest of the Worker's privileged routes.
export async function onRequestPostRun({ request, env }) {
  const { requireAdmin } = await import("../_shared.js");
  if (!requireAdmin(request, env)) return reply({ error: "Unauthorized" }, 401);
  return reply(await runReminders(env));
}
