// Pure, framework-free game logic. No Firebase here so it can be unit-tested with plain Node.

// Short, hand-writable code for the back of each laminated photo, built
// from the player's own name (so it's memorable / easy to double-check)
// but with random filler letters scattered in between to disguise it at a
// glance. All caps, letters only. Excludes I/L/O for the filler letters
// specifically, since those get confused for 1/0 when copied by eye off a
// physical card - real name letters are kept as-is even if they're one of
// those, since the point is to preserve the name.
const FILLER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const FILLER_COUNT = 4;

export function generateKillCode(name) {
  const letters = String(name || "").toUpperCase().replace(/[^A-Z]/g, "").split("");
  if (!letters.length) letters.push("X");

  // Scatter FILLER_COUNT random letters across the gaps around the name's
  // own letters (including before the first and after the last).
  const gapCounts = new Array(letters.length + 1).fill(0);
  for (let i = 0; i < FILLER_COUNT; i++) {
    gapCounts[Math.floor(Math.random() * gapCounts.length)]++;
  }

  const randomFiller = () => FILLER_ALPHABET[Math.floor(Math.random() * FILLER_ALPHABET.length)];

  const code = [];
  for (let i = 0; i < letters.length; i++) {
    for (let f = 0; f < gapCounts[i]; f++) code.push(randomFiller());
    code.push(letters[i]);
  }
  for (let f = 0; f < gapCounts[letters.length]; f++) code.push(randomFiller());

  return code.join("");
}

export function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Builds a single Hamiltonian loop over `players` (everyone hunts exactly one
// person, everyone is hunted by exactly one person, no self-targets) with the
// edge riggedHunter -> riggedTarget forced. Everything else is a uniformly
// random rotation of the remaining players, so the rest of the loop is a
// genuine surprise - including to whoever runs this function.
export function generateAssassinCycle(players, riggedHunter, riggedTarget) {
  const clean = players.map((p) => p.trim()).filter(Boolean);

  const seen = new Set();
  for (const p of clean) {
    const key = p.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate name in guest list: "${p}"`);
    seen.add(key);
  }
  if (clean.length < 3) throw new Error("Need at least 3 players to form a loop.");

  const hunterIdx = clean.findIndex((p) => p.toLowerCase() === riggedHunter.trim().toLowerCase());
  const targetIdx = clean.findIndex((p) => p.toLowerCase() === riggedTarget.trim().toLowerCase());
  if (hunterIdx === -1) throw new Error(`"${riggedHunter}" is not in the guest list.`);
  if (targetIdx === -1) throw new Error(`"${riggedTarget}" is not in the guest list.`);
  if (hunterIdx === targetIdx) throw new Error("Rigged hunter and target must be different people.");

  const hunter = clean[hunterIdx];
  const target = clean[targetIdx];
  const rest = clean.filter((_, i) => i !== hunterIdx && i !== targetIdx);

  // Fisher-Yates shuffle of everyone except the rigged pair.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  const order = [hunter, target, ...rest];
  const assignments = {};
  for (let i = 0; i < order.length; i++) {
    assignments[order[i]] = order[(i + 1) % order.length];
  }
  return assignments;
}
