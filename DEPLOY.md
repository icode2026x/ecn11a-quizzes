# Deploy ECN 11A Quiz Hub (Google login + cloud progress)

This app can run as a static site. **Google Sign-In and cross-device progress** use a free Firebase project (Auth + Firestore). Hosting can be **GitHub Pages** and/or **Firebase Hosting**.

## 1) Create the GitHub repo and push

From this folder (PowerShell):

```powershell
git init
git add .
git commit -m "Add ECN 11A Quiz Hub with Google sync"
gh repo create ecn11a-quizzes --public --source=. --remote=origin --push
```

If `gh` is not installed, create an empty repo on GitHub named `ecn11a-quizzes`, then:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/ecn11a-quizzes.git
git branch -M main
git push -u origin main
```

### Enable GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. After the workflow runs, your site URL will look like:  
   `https://YOUR_USERNAME.github.io/ecn11a-quizzes/`

> If the site is in a subpath (`/ecn11a-quizzes/`), that is fine — this app uses relative asset paths and hash routing.

## 2) Create Firebase (required for Google login + saving progress)

1. Open [Firebase Console](https://console.firebase.google.com/) and sign in with Google.
2. **Add project** → name it e.g. `ecn11a-quiz-hub` → continue (Google Analytics optional).
3. On the project overview, click the **Web** icon (`</>`) → register app → copy the `firebaseConfig` values.
4. Paste them into `js/firebase-config.js` (fill `apiKey`, `authDomain`, `projectId`, etc.).
5. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save**.
6. **Build → Firestore Database → Create database**  
   - Start in **production mode**  
   - Pick a region close to you
7. Open the **Rules** tab and paste the contents of `firestore.rules`, then **Publish**.
8. **Authentication → Settings → Authorized domains** → add:
   - `localhost`
   - `YOUR_USERNAME.github.io`
   - your Firebase Hosting domain if you use it (e.g. `ecn11a-quiz-hub.web.app`)

9. Commit and push the updated config:

```powershell
git add js/firebase-config.js
git commit -m "Add Firebase config for Google login"
git push
```

## 3) Optional: Firebase Hosting (nice phone URL)

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

You’ll get a URL like `https://YOUR_PROJECT.web.app`.

## 4) Use it on iPhone

1. Open the deployed URL in Safari.
2. Tap **Sign in** (Google).
3. Take quizzes — scores and in-progress sessions sync to your account.
4. On your PC, open the same URL and sign in with the same Google account to see the same progress.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Sign-in button does nothing useful / “not configured” | `js/firebase-config.js` still has empty keys |
| `auth/unauthorized-domain` | Add your site domain under Firebase Auth → Authorized domains |
| Sync fails after login | Publish `firestore.rules`; confirm Google sign-in is enabled |
| Popup blocked on iPhone | App uses redirect on mobile automatically — just finish the Google page |
| GitHub Pages 404 on refresh | Hash routes (`#/module/...`) avoid this; use those links |
