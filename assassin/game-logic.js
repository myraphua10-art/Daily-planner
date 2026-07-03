// Pure, framework-free game logic. No Firebase here so it can be unit-tested with plain Node.

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

// Short, hand-writable verification code, one per player - meant to be
// written on the back of each person's printed photo/polaroid before the
// party. Excludes visually ambiguous characters (0/O, 1/I/L) so it's easy to
// transcribe by hand and read back under party lighting.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateKillCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}
