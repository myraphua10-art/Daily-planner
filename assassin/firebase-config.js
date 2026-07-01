// Fill these in from: Firebase Console -> Project Settings -> General -> "Your apps" -> Web app.
// These values are meant to be public - Firebase apps protect data with Firestore
// Security Rules (see firestore.rules), not by hiding this config object.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// A short, unique id for this particular game. Leave as-is unless you want to
// run more than one game (e.g. a test run before the real one).
export const GAME_ID = "myras-sweet-16";
