# Daily-planner

Two unrelated apps share this repo and one Cloudflare Worker.

| | What it is | Files |
|---|---|---|
| **Exam planner** | Myra's study/exam PWA. The main thing under active development. | `index.html`, `sw.js`, `functions/reminders.js`, `functions/api/planner-sync.js`, `functions/api/push-notify.js` |
| **Assassin** | A party game built for a birthday in Aug 2026. Finished; don't change it unless asked. | `assassin/`, most of `functions/api/` |

`worker/index.js` routes everything. `wrangler.toml` binds one KV namespace
(`ASSASSIN_KV`) that both apps use, with different key prefixes. There is no
build step and no framework — the planner is a single HTML file.

## Standing rules

- **Never touch production data.** Claude has no access to the live Cloudflare
  account and should never ask for it. Build tools; Myra runs them.
- **Test locally before saying it works.** `npx wrangler@3 dev --port 8788
  --local-protocol http --persist-to <tmpdir>` gives a real Worker + local KV.
  Chromium and Playwright are available for driving the UI
  (`executablePath: '/opt/pw-browsers/chromium'`); use
  `page.on('pageerror')` — this app fails silently otherwise.
- **Myra is in Singapore (UTC+8).** Format dates in local time, never via
  `toISOString()`. See `toISODate()` in `index.html`; using UTC here has
  already caused one real bug.
- **Escape anything the user typed** before rendering it — see `esc()`.
- Deploy is Myra's job. Say plainly when a change needs a redeploy or a secret.

## The planner

Tabs: Today's Plan · What's Coming Up · Week Map · Topic Tracker · My Entries.

- `EXAMS` and `EVENTS` near the top of `index.html` are the school timetable,
  hand-transcribed from Myra's journal. Past items are filtered out on render,
  never deleted.
- Five categories (`CATEGORIES`): exams, important, social, sport, other.
  Everything — built-in and user-added — carries one.
- **Storage** is one document in `localStorage` under `planner-doc-v1`, with
  sections `entries`, `hidden`, `topics`, `settings`, `snapshot`. Every item
  carries its own `updatedAt`.
- **Sync** (`/api/planner-sync`) is accountless: a random code identifies a
  planner, and KV is keyed by its SHA-256 so the raw code is never stored. The
  client posts its whole document, the server merges per item by `updatedAt`
  and returns the result — so two devices can't clobber each other and no
  locking is needed. Deletes are tombstones; a plain removal would be
  resurrected by the merge.
  - **Adding a section means adding it to `SECTIONS` in BOTH `index.html` and
    `functions/api/planner-sync.js`.** A section missing from the server's list
    is silently dropped on every sync. This has bitten once already.
- **Reminders** (`functions/reminders.js`) run from a cron trigger. The page
  writes a snapshot of its own calendar into the synced document, because the
  Worker can't see `EXAMS`/`EVENTS`. Pushes carry **no payload** — the service
  worker wakes and fetches the text from `/api/pending-notification`. Payload
  encryption was deliberately avoided; it fails silently on real devices.
  Setup lives in `REMINDERS.md`.

## Current state

Sync works. Reminders are built and tested but **were not yet delivering** as
of the last session — Myra had added the VAPID secrets but a test push failed.
Diagnostics were then improved, so the next step is:

    GET /api/push-health

which reports in one line whether the Worker can send and what's wrong if not.
It never returns key material, so its output is safe to paste into a chat.

The VAPID key pair was rotated in Sept 2026 (the original private key was a
Cloudflare Secret and unreadable). A consequence: the separate
`personalplanner` Worker, which sends the swim/gym/tuition reminders and whose
source is **not in this repo**, still signs with the old key and will have
stopped working. Folding those reminders into this system is an open offer.

## Working with Myra

She's a secondary-school student, not a developer — she'll say what she wants
in plain terms and doesn't want a tour of the internals. Give short answers,
concrete click-by-click steps for anything on Cloudflare or GitHub, and say
outright when something can't be done or has a cost. Commit messages in this
repo carry the reasoning behind each change; `git log` is the real history of
the project.
