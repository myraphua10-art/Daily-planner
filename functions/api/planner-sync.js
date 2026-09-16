// Cross-device sync for the exam planner (the root index.html — nothing to do
// with the assassin game, it just shares this Worker and its KV namespace).
//
// There are no accounts. A device holds a long random "sync code"; everything
// saved under that code is one shared planner. The code is the only secret, so
// it's never stored raw — KV is keyed by its SHA-256 instead, which means a
// leaked KV listing can't be used to read anyone's planner.
//
// Sync is a single POST: the client sends its whole document, the server merges
// it into the stored one and returns the result. Merging happens per item by
// `updatedAt`, so two devices posting at the same time can't clobber each
// other — whoever writes second folds the first one's changes back in, and each
// device picks up everything on its next call. That's why no locking or
// revision check is needed, which KV couldn't give us anyway.

const MAX_BODY = 512 * 1024;      // a planner this size would be thousands of entries
const TOMBSTONE_TTL = 90 * 86400_000;  // deleted entries stay this long so every device sees the delete

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

async function codeKey(code) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`planner:${code}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `planner-sync:${hex}`;
}

// Keep this in step with SECTIONS/mergeDoc() in index.html — the client merges
// the same way locally so it can work offline and still converge. A section
// missing from this list is silently dropped on every sync, so anything added
// on the client has to be added here too.
//   entries  – things typed into the planner, one item per id
//   hidden   – built-in exams switched off, one item per exam
//   topics   – topic-tracker ticks, one item per topic
//   settings – reminder preferences, one item per setting
//   snapshot – the calendar the reminder cron reads (single item, "cal")
const SECTIONS = ["entries", "hidden", "topics", "settings", "snapshot"];

function mergeSection(mine, theirs) {
  const out = { ...(mine || {}) };
  for (const [k, v] of Object.entries(theirs || {})) {
    if (!v || typeof v !== "object") continue;
    const existing = out[k];
    if (!existing || (v.updatedAt || 0) > (existing.updatedAt || 0)) out[k] = v;
  }
  return out;
}

function mergeDoc(stored, incoming) {
  const out = {};
  for (const s of SECTIONS) out[s] = mergeSection(stored[s], incoming[s]);
  return out;
}

// Drops deleted entries once every device has had ample time to see the delete.
function pruneTombstones(doc, now) {
  for (const [id, e] of Object.entries(doc.entries || {})) {
    if (e && e.deleted && now - (e.updatedAt || 0) > TOMBSTONE_TTL) delete doc.entries[id];
  }
  return doc;
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply({ error: "Planner is too large to sync." }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return reply({ error: "Bad request." }, 400);
  }

  const code = String(body.code || "").trim();
  if (!/^[a-z0-9-]{8,64}$/.test(code)) return reply({ error: "Invalid sync code." }, 400);

  const incoming = body.doc && typeof body.doc === "object" ? body.doc : {};
  const key = await codeKey(code);

  const storedRaw = await env.ASSASSIN_KV.get(key);
  const stored = storedRaw ? JSON.parse(storedRaw) : {};

  const merged = pruneTombstones(mergeDoc(stored, incoming), Date.now());
  await env.ASSASSIN_KV.put(key, JSON.stringify(merged));

  return reply({ ok: true, doc: merged, syncedAt: Date.now() });
}
