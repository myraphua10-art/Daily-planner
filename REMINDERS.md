# Turning on planner reminders

The reminder code is already in the repo. Two things have to happen on
Cloudflare before notifications can actually be sent.

## 1. Set the notification keys

Reminders are signed with a VAPID key pair — the same pair the planner page
already references. `index.html` has the **public** key in it
(`VAPID_PUBLIC_KEY`, near the top). The Worker needs both halves.

**If you still have the private key** from when the original notification
Worker was set up, use that pair — existing subscriptions keep working.

**If you can't find it**, make a new pair:

```
npx web-push generate-vapid-keys
```

and paste the new **public** key into `VAPID_PUBLIC_KEY` in `index.html`.
Anyone already subscribed will need to tap "Turn on reminders" again.

Then set all three as Worker secrets:

```
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT      # e.g. mailto:myra.phua10@rafflesgirlssch.edu.sg
```

(Or Cloudflare dashboard → the Worker → Settings → Variables and Secrets.)

Without these the Worker still runs normally; the app just says reminders
aren't set up on the server yet.

## 2. Deploy

```
npx wrangler deploy
```

This also installs the cron trigger declared in `wrangler.toml`, which runs
every 15 minutes and sends whatever is due.

## 3. Check it works

On the phone, open the planner → ➕ tab → **Turn on reminders** → **Send a
test**. A notification should arrive within a few seconds.

On iPhone this only works if the planner has been added to the Home Screen
and opened from that icon — Safari tabs can't receive push at all. The app
says so if you try.

## How it fits together

- The page writes a list of what's coming up (`snapshot.cal`) into the synced
  document, so the Worker knows the calendar without knowing the timetable.
- The cron job reads that, works out what's due in the user's own time zone,
  and sends an **empty** push.
- The service worker wakes, calls `/api/pending-notification` to ask what it
  says, and shows it. Empty pushes avoid having to encrypt payloads, which is
  the part that tends to fail silently on real devices.
- Each reminder is marked as sent for 7 days, so nothing arrives twice.

Reminder timings live in the synced document, so changing them on one device
changes them everywhere. The subscription itself is per-device: turning
reminders off on the laptop doesn't turn them off on the phone.
