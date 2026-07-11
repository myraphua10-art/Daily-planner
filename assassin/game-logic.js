// Pure, framework-free game logic. No Firebase here so it can be unit-tested with plain Node.

// Short, hand-writable code for the back of each laminated photo, built by
// taking the player's own name and swapping out a few of its letters for
// random digits - same length as the name, close enough to still look like
// it, cryptic enough not to read as an exact match at a glance. All caps.
// Digits exclude 0/1 since those get confused for O/I when copied by eye
// off a physical card.
const DIGIT_ALPHABET = "23456789";

export function generateKillCode(name) {
  const letters = String(name || "").toUpperCase().replace(/[^A-Z]/g, "").split("");
  if (!letters.length) letters.push("X");

  const numToReplace = Math.min(letters.length, Math.max(1, Math.round(letters.length * 0.35)));
  const positions = new Set();
  while (positions.size < numToReplace) {
    positions.add(Math.floor(Math.random() * letters.length));
  }

  const code = letters.slice();
  for (const pos of positions) {
    code[pos] = DIGIT_ALPHABET[Math.floor(Math.random() * DIGIT_ALPHABET.length)];
  }

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
