# Deployment and secrets

## Branches and environments

| Branch    | Environment | Firebase project (suggested ID) | Deploys when                              |
| --------- | ----------- | ------------------------------- | ----------------------------------------- |
| `develop` | `dev`       | `ledgerly-dev`                  | a PR is merged into `develop`             |
| `test`    | `test`      | `ledgerly-test`                 | a PR from `develop` is merged into `test` |
| `prod`    | `prod`      | `ledgerly-prod`                 | a PR from `test` is merged into `prod`    |

Flow: `phase-<n>-<slug>` → PR → `develop` → PR → `test` → PR → `prod`.

- `.github/workflows/ci.yml` runs on every PR into these branches. It enforces the order above (only `develop` may open into `test`, only `test` into `prod`) and runs lint, typecheck, test and build.
- `.github/workflows/deploy.yml` runs on every push to these branches (a merged PR is a push). It picks the matching GitHub Environment, builds with that environment's secrets and publishes the app to **GitHub Pages**. It deploys nothing to Firebase unless you ask it to; see [Firebase rules and indexes](#firebase-rules-and-indexes).
- After a successful deploy the app URL is shown on the workflow run (next to the job and in its summary) and under the repo's **Deployments** / **Environments**. See [App URL](#app-url).

## Secrets

Secrets live in **GitHub Environments**, one set per environment, never in the repo. Each of `dev`, `test` and `prod` needs the same names with that project's values:

| Secret                              | Where to find it                                                           |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Firebase console → Project settings → General → Your apps → Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN`         | same config                                                                |
| `VITE_FIREBASE_PROJECT_ID`          | same config (also used as the deploy target)                               |
| `VITE_FIREBASE_STORAGE_BUCKET`      | same config                                                                |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same config                                                                |
| `VITE_FIREBASE_APP_ID`              | same config                                                                |
| `VITE_FIREBASE_MEASUREMENT_ID`      | same config (only if Analytics is enabled; otherwise leave empty)          |
| `VITE_FIREBASE_VAPID_KEY`           | Project settings → Cloud Messaging → Web Push certificates → key pair      |
| `FIREBASE_SERVICE_ACCOUNT`          | full JSON key of a deploy service account (see below)                      |

The `VITE_*` web config values are shipped to the browser, so they are not truly secret; security comes from Firestore and Storage rules. Keeping them in Environments still keeps each environment's config in one place. `FIREBASE_SERVICE_ACCOUNT` **is** secret.

Local development uses `.env.local` (git-ignored), copied from `.env.example`.

## One-time setup (owner)

1. **Create three Firebase projects** (`ledgerly-dev`, `ledgerly-test`, `ledgerly-prod`). In each: add a Web app, enable Authentication, Firestore, Storage (Firebase console → Storage → Get started, which creates the default bucket the deploy needs) and Cloud Messaging, and generate a Web Push key pair.
2. **Create a deploy service account** in each project: Google Cloud console → IAM → Service accounts → Create. Grant these roles, then create a JSON key and download it:
   - Recommended: `Firebase Admin` and `Service Usage Consumer`.
   - Narrower alternative: `Firebase Rules Admin`, `Cloud Datastore Index Admin`, `Cloud Storage for Firebase Admin`, `Service Account User`, `Service Usage Consumer`.
   - Common `firebase deploy` errors this fixes:
     - `403 Permission denied to get service [firebasestorage.googleapis.com]`: add `Service Usage Consumer`. The CLI checks that each product's API is enabled before deploying it.
     - `403 Permission 'firebasestorage.defaultBucket.get' denied ... (or it may not exist)`: first make sure Storage is set up (Firebase console → Storage → Get started; new buckets need the Blaze plan). If it is, the account is missing `Firebase Admin` or `Cloud Storage for Firebase Admin`.
3. **Create GitHub Environments**: repo → Settings → Environments → New environment, named exactly `dev`, `test`, `prod`. Add the secrets from the table to each.
   - On `prod`, add yourself under **Required reviewers** so production deploys wait for your approval.
   - Optionally restrict each environment's **Deployment branches** to its branch (`develop`, `test`, `prod`).
4. **Default branch**: Settings → General → Default branch → `develop`.
5. **Protect branches**: Settings → Branches (or Rules) → add rules for `develop`, `test`, `prod`: require a pull request, require the `Promotion order` and `Lint, typecheck, test, build` checks, block force pushes and deletion.
6. Delete the downloaded service account JSON files from your computer once they are stored in GitHub.

## Rotating a secret

Replace the value in the Environment (Settings → Environments → env → secret → Update). For the service account, create a new key, update `FIREBASE_SERVICE_ACCOUNT`, confirm a deploy, then delete the old key in Google Cloud.

## App URL

The app is hosted on GitHub Pages from the `gh-pages` branch, which `deploy.yml` writes to. Each environment has its own folder, so the three never overwrite each other:

| Merged PR into | Deploys Environment | App URL                                                     |
| -------------- | ------------------- | ----------------------------------------------------------- |
| `develop`      | `dev`               | `https://tharunchowdary744.github.io/expense-tracker/dev/`  |
| `test`         | `test`              | `https://tharunchowdary744.github.io/expense-tracker/test/` |
| `prod`         | `prod`              | `https://tharunchowdary744.github.io/expense-tracker/`      |

Each Environment's latest URL is listed on the repo's **Environments** page (Code tab → Deployments).

One-time setup:

1. After the first deploy has created the `gh-pages` branch: repo → Settings → Pages → Build and deployment → Source **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
2. In each Firebase project: Authentication → Settings → Authorized domains → add `tharunchowdary744.github.io`, or sign-in fails with `auth/unauthorized-domain`.

How it works: the build sets Vite's `base` (and the router's basename) from `BASE_PATH`, e.g. `/expense-tracker/dev/`. Pages has no SPA rewrites, so `public/404.html` sends unknown paths back to the right environment's `index.html`, which restores the path before the app starts.

Known limitations:

- All three environments share one origin (`tharunchowdary744.github.io`), so they share browser storage such as the theme setting. Firebase keeps each project's sign-in and offline data separate.
- Google sign-in by redirect (used when popups are blocked) can fail on browsers that block third-party storage, because the app is no longer on the Firebase auth domain. The popup flow works.

## Firebase rules and indexes

`deploy.yml` deploys nothing to Firebase by default. Firestore rules and indexes in the repo therefore do **not** reach a project on merge. Either:

- publish them by hand: Firebase console → Firestore → Rules (paste `firestore.rules`) and Indexes (from `firestore.indexes.json`), or
- let CI do it: set the repo or Environment variable `FIREBASE_DEPLOY_ONLY` to `firestore` (add `,storage` when receipts are on). The service account then needs the roles in [One-time setup](#one-time-setup-owner), including `Firebase Rules Admin` (part of `Firebase Admin`).

## Receipts and Storage

Receipts (file attachments in Firebase Storage) are switched off for now:

- The app build hides all receipt UI and keeps the upload queue idle unless `VITE_RECEIPTS_ENABLED` is `"true"`. Saved attachment data in Firestore is left as is.
- `deploy.yml` does not deploy `storage.rules` or check the Storage API. `storage.rules` and its rules tests stay in the repo and keep running in CI.

To turn receipts back on for an environment, in GitHub → Settings → Environments → env → Variables (or as repository variables for all of them):

1. Set `VITE_RECEIPTS_ENABLED` to `true`.
2. Publish `storage.rules` (Firebase console → Storage → Rules), or set `FIREBASE_DEPLOY_ONLY` to `firestore,storage`.
3. Make sure Storage is enabled in that Firebase project and the deploy service account has `Service Usage Consumer` (see above), then redeploy.

Locally, set `VITE_RECEIPTS_ENABLED=true` in `.env.local`.
