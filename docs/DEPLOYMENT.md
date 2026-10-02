# Deployment and secrets

## Branches and environments

| Branch    | Environment | Firebase project (suggested ID) | Deploys when                              |
| --------- | ----------- | ------------------------------- | ----------------------------------------- |
| `develop` | `dev`       | `ledgerly-dev`                  | a PR is merged into `develop`             |
| `test`    | `test`      | `ledgerly-test`                 | a PR from `develop` is merged into `test` |
| `prod`    | `prod`      | `ledgerly-prod`                 | a PR from `test` is merged into `prod`    |

Flow: `phase-<n>-<slug>` → PR → `develop` → PR → `test` → PR → `prod`.

- `.github/workflows/ci.yml` runs on every PR into these branches. It enforces the order above (only `develop` may open into `test`, only `test` into `prod`) and runs lint, typecheck, test and build.
- `.github/workflows/deploy.yml` runs on every push to these branches (a merged PR is a push). It picks the matching GitHub Environment, builds with that environment's secrets, and runs `firebase deploy` (Hosting, Firestore rules and indexes, Storage rules).
- Until the app has a `package.json` and `firebase.json`, both workflows pass and skip those steps.

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

1. **Create three Firebase projects** (`ledgerly-dev`, `ledgerly-test`, `ledgerly-prod`). In each: add a Web app, enable Authentication, Firestore, Storage and Cloud Messaging, and generate a Web Push key pair.
2. **Create a deploy service account** in each project: Google Cloud console → IAM → Service accounts → Create. Grant `Firebase Admin` (or, narrower: `Firebase Hosting Admin`, `Firebase Rules Admin`, `Cloud Datastore Index Admin`, `Service Account User`). Create a JSON key and download it.
3. **Create GitHub Environments**: repo → Settings → Environments → New environment, named exactly `dev`, `test`, `prod`. Add the secrets from the table to each.
   - On `prod`, add yourself under **Required reviewers** so production deploys wait for your approval.
   - Optionally restrict each environment's **Deployment branches** to its branch (`develop`, `test`, `prod`).
4. **Default branch**: Settings → General → Default branch → `develop`.
5. **Protect branches**: Settings → Branches (or Rules) → add rules for `develop`, `test`, `prod`: require a pull request, require the `Promotion order` and `Lint, typecheck, test, build` checks, block force pushes and deletion.
6. Delete the downloaded service account JSON files from your computer once they are stored in GitHub.

## Rotating a secret

Replace the value in the Environment (Settings → Environments → env → secret → Update). For the service account, create a new key, update `FIREBASE_SERVICE_ACCOUNT`, confirm a deploy, then delete the old key in Google Cloud.
