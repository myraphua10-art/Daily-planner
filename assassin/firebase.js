// Shared Firebase wiring used by both index.html (guests) and admin.html (host).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, GAME_ID } from "./firebase-config.js";
import { slugify } from "./game-logic.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Resolves once we have an (anonymous) signed-in user. Every browser/device
// gets its own uid - that's what lets Firestore rules bind a claimed name to
// the device that claimed it, so nobody can read someone else's target.
export function whenReady() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
    });
    signInAnonymously(auth).catch(reject);
  });
}

export function gameDocRef() {
  return doc(db, "games", GAME_ID);
}

export function assignmentDocRef(name) {
  return doc(db, "games", GAME_ID, "assignments", slugify(name));
}

export async function getGame() {
  const snap = await getDoc(gameDocRef());
  return snap.exists() ? snap.data() : null;
}

export { doc, getDoc, setDoc, updateDoc };
