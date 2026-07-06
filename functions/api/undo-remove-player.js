import { json, getGame, putGame, requireAdmin, assignKey, removalBackupKey } from "../_shared.js";

// Admin only. Reverts a /api/remove-player call - but only if nothing about
// the affected hunter or followers has changed since. If the game has
// moved on (e.g. the substitute hunter already made another kill),
// restoring the old state would corrupt it, so this refuses rather than
// guessing.
export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  const game = await getGame(env);
  if (!game) return json({ error: "No game found." }, 400);

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return json({ error: "Missing name." }, 400);

  const backupKey = removalBackupKey(name);
  const backupRaw = await env.ASSASSIN_KV.get(backupKey);
  if (!backupRaw) return json({ error: "No recent removal found for that name to undo." }, 404);
  const backup = JSON.parse(backupRaw);

  if (backup.affectedHunter) {
    const raw = await env.ASSASSIN_KV.get(assignKey(backup.affectedHunter));
    const rec = raw ? JSON.parse(raw) : null;
    if (
      !rec ||
      rec.status !== "active" ||
      rec.targetName?.toLowerCase() !== backup.removedRecord.targetName?.toLowerCase()
    ) {
      return json({ error: `Can't undo - ${backup.affectedHunter}'s game has moved on since the removal.` }, 409);
    }
  }
  for (const followerName of backup.affectedFollowers) {
    const raw = await env.ASSASSIN_KV.get(assignKey(followerName));
    const rec = raw ? JSON.parse(raw) : null;
    if (!rec || rec.following?.toLowerCase() !== backup.redirectFollowersTo?.toLowerCase()) {
      return json({ error: `Can't undo - ${followerName}'s game has moved on since the removal.` }, 409);
    }
  }

  await env.ASSASSIN_KV.put(assignKey(backup.removedName), JSON.stringify(backup.removedRecord));

  if (backup.affectedHunter) {
    const raw = await env.ASSASSIN_KV.get(assignKey(backup.affectedHunter));
    const rec = JSON.parse(raw);
    rec.targetName = backup.removedName;
    await env.ASSASSIN_KV.put(assignKey(backup.affectedHunter), JSON.stringify(rec));
  }

  for (const followerName of backup.affectedFollowers) {
    const raw = await env.ASSASSIN_KV.get(assignKey(followerName));
    const rec = JSON.parse(raw);
    rec.following = backup.removedName;
    await env.ASSASSIN_KV.put(assignKey(followerName), JSON.stringify(rec));
  }

  await putGame(env, {
    ...game,
    players: backup.playersBefore,
    birthdays: backup.birthdaysBefore,
    bountyTarget: backup.bountyTargetBefore,
  });

  await env.ASSASSIN_KV.delete(backupKey);

  return json({ ok: true, restored: backup.removedName });
}
