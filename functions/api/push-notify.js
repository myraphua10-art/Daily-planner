// Endpoints the planner and its service worker use for reminders.
//
//   POST /api/push-subscribe        register this device (or unregister it)
//   POST /api/pending-notification  service worker asking "what should I show?"
//   POST /api/push-test             send one notification right now
//
// A subscription is stored against the SHA-256 of the sync code — the same key
// the planner document lives under — so the cron job can read the calendar
// without the raw code ever being written down.

import { sha256hex, subKey, pendingKey, queueAndTickle, runReminders, verifyVapidKeys } from "../reminders.js";

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

// GET /api/push-health — is the Worker able to send reminders at all?
// Reports only whether each secret is present and well-formed. It never
// returns key material.
export async function onRequestGetHealth({ env }) {
  const keys = await verifyVapidKeys(env);
  const publicKey = String(env.VAPID_PUBLIC_KEY || "");
  return reply({
    ready: keys.ok,
    problem: keys.ok ? undefined : keys.error,
    publicKeySet: Boolean(env.VAPID_PUBLIC_KEY),
    privateKeySet: Boolean(env.VAPID_PRIVATE_KEY),
    subjectSet: Boolean(env.VAPID_SUBJECT),
    // Enough to tell at a glance whether the Worker and the app agree, without
    // revealing anything secret (the public key is in the page source anyway).
    publicKeyStartsWith: publicKey.slice(0, 12),
    publicKeyLength: publicKey.length,
  });
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

    // Check the keys before sending, so a mis-pasted secret says so plainly
    // instead of looking like a network problem.
    const keys = await verifyVapidKeys(env);
    if (!keys.ok) return reply({ error: `Server setup: ${keys.error}` }, 503);

    const outcome = await queueAndTickle(env, rec, [
      { title: "Reminders are working", body: "This is what an exam reminder will look like." },
    ]);
    if (outcome.error) return reply({ error: outcome.error }, 502);
    if (outcome.status === 403) {
      return reply({ error: "The push service rejected the key (403). This device subscribed under a different VAPID key — turn reminders off and on again to re-subscribe." }, 502);
    }
    if (outcome.status === 404 || outcome.status === 410) {
      return reply({ error: "This device's subscription has expired. Turn reminders off and on again." }, 502);
    }
    if (outcome.status >= 400) {
      return reply({ error: `Push service said ${outcome.status}${outcome.detail ? `: ${outcome.detail}` : "."}` }, 502);
    }
    return reply({ ok: true, status: outcome.status });
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
