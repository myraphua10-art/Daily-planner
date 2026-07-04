import { json, getGame, assignKey } from "../_shared.js";

// Public, no passcode needed - this is meant to be pulled up on a screen at
// the party. Only ever returns each player's status (active/eliminated/won)
// and, if eliminated, who got them - never targetName, so it can't leak who
// is currently hunting whom.
export async function onRequestGet({ env }) {
  const game = await getGame(env);
  if (!game || !game.locked) return json({ locked: false, players: [], bountyTarget: null });

  const players = await Promise.all(
    game.players.map(async (name) => {
      const raw = await env.ASSASSIN_KV.get(assignKey(name));
      if (!raw) return { name, status: "active", kills: 0 };
      const record = JSON.parse(raw);
      return {
        name,
        status: record.status,
        kills: record.kills || 0,
        eliminatedBy: record.status === "eliminated" ? record.eliminatedBy : undefined,
        immune: record.status === "active" ? Boolean(record.immune) : undefined,
      };
    })
  );

  return json({ locked: true, players, bountyTarget: game.bountyTarget || null });
}
