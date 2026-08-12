/* ============================================================
   Firebase project config
   ------------------------------------------------------------
   1. Go to https://console.firebase.google.com/
   2. Create a project (e.g. "ecn11a-quiz-hub")
   3. Add a Web app → copy the firebaseConfig object
   4. Paste the values below
   5. Authentication → Sign-in method → enable Google
   6. Firestore Database → Create database (start in production mode)
   7. Deploy firestore.rules (or paste them in the Rules tab)
   8. Authentication → Settings → Authorized domains
      → add your GitHub Pages / Hosting domain
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

window.FIREBASE_CONFIGURED = !!(
  window.FIREBASE_CONFIG.apiKey &&
  window.FIREBASE_CONFIG.projectId &&
  window.FIREBASE_CONFIG.appId
);
