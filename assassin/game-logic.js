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
// person, everyone is hunted by exactly one person, no self-targets) with an
// ordered "rigged chain" of consecutive edges forced. A chain of
// ["Jayna", "Myra", "Qingyang"] forces Jayna -> Myra -> Qingyang; everyone
// else is a uniformly random rotation appended after the chain, so the rest
// of the loop stays a genuine surprise - including to whoever runs this.
//
// Back-compat: also accepts the old (players, riggedHunter, riggedTarget)
// string form, treated as a 2-long chain.
export function generateAssassinCycle(players, riggedChain, maybeTarget) {
  const clean = players.map((p) => p.trim()).filter(Boolean);

  const seen = new Set();
  for (const p of clean) {
    const key = p.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate name in guest list: "${p}"`);
    seen.add(key);
  }
  if (clean.length < 3) throw new Error("Need at least 3 players to form a loop.");

  // Normalize the rigged chain from either the array form or the legacy
  // (hunter, target) string form, matching each name back to its canonical
  // spelling in the guest list.
  const rawChain = Array.isArray(riggedChain)
    ? riggedChain
    : [riggedChain, maybeTarget];

  const chain = [];
  const chainSeen = new Set();
  for (const raw of rawChain) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const match = clean.find((p) => p.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error(`"${name}" is not in the guest list.`);
    if (chainSeen.has(match.toLowerCase())) {
      throw new Error(`"${match}" can't appear twice in the forced chain.`);
    }
    chainSeen.add(match.toLowerCase());
    chain.push(match);
  }

  const rest = clean.filter((p) => !chainSeen.has(p.toLowerCase()));

  // Fisher-Yates shuffle of everyone not pinned in the chain.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  const order = [...chain, ...rest];
  const assignments = {};
  for (let i = 0; i < order.length; i++) {
    assignments[order[i]] = order[(i + 1) % order.length];
  }
  return assignments;
}
