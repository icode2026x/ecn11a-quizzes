# ECN 11A Quiz Hub

Interactive quiz app for ECN 11A modules — practice/exam modes, dark mode, saved in-progress sessions, Google Sign-In, and cloud progress sync.

## Quick start (this computer)

```bash
node serve.js
```

Open `http://localhost:8765`.

## Phone + Google login + cloud progress

1. Push this repo to GitHub and enable **GitHub Pages** (Actions).
2. Create a free **Firebase** project and paste keys into `js/firebase-config.js`.
3. Enable **Google** sign-in and publish `firestore.rules`.
4. Open the live site on your iPhone → **Sign in**.

Full steps: see [DEPLOY.md](./DEPLOY.md).
