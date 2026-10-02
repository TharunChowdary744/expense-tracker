# Ledgerly

Personal and group expense tracker: a React + TypeScript web app and installable PWA that talks directly to Firebase (no custom backend). See [`CLAUDE.md`](CLAUDE.md) for the product scope, stack and working rules, and [`docs/`](docs) for architecture and deployment.

## Requirements

- Node.js 22.22 or newer (see `engines` in `package.json`)
- Java 21+ only if you run the Firebase emulators (`npm run emulators`)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your dev Firebase web app config (optional for the shell)
npm run dev                   # http://localhost:5173
```

The app shell (navigation, theme, placeholder pages) runs without any Firebase config. Firebase is initialised lazily by `src/lib/firebase.ts` once data features need it.

### Environment variables

All config comes from `import.meta.env`; `.env.example` lists every key.

| Variable                  | Purpose                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `VITE_USE_EMULATORS`      | `true` connects Auth (9099), Firestore (8080) and Storage (9199) emulators in dev |
| `VITE_FIREBASE_*`         | Web app config from Firebase console → Project settings                           |
| `VITE_FIREBASE_VAPID_KEY` | Web Push key for FCM (used in a later phase)                                      |
| `VITE_APP_ENV`            | `local`, `dev`, `test` or `prod`                                                  |

`.env.local` is git-ignored. CI/CD secrets live only in GitHub Environment secrets (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

### Firebase emulators

```bash
npm run emulators   # Auth, Firestore, Storage, Hosting + Emulator UI on :4000
```

`.firebaserc` maps `dev`, `test` and `prod` to `ledgerly-dev`, `ledgerly-test` and `ledgerly-prod`; change these to your real project IDs. `firestore.rules` and `storage.rules` are real, tested rules (see [`docs/AUTH.md`](docs/AUTH.md)); everything not explicitly allowed is denied.

## Scripts

| Script               | What it does                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`        | Vite dev server                                                                   |
| `npm run build`      | Typecheck then production build into `dist/`                                      |
| `npm run preview`    | Serve the production build                                                        |
| `npm run lint`       | ESLint (zero warnings allowed)                                                    |
| `npm run typecheck`  | `tsc -b --noEmit`                                                                 |
| `npm run test`       | Vitest + React Testing Library                                                    |
| `npm run test:rules` | Security-rules tests against the Firestore and Storage emulators (needs Java 21+) |
| `npm run test:e2e`   | Playwright smoke tests (desktop and mobile viewports)                             |
| `npm run format`     | Prettier write                                                                    |

### End-to-end tests

```bash
npx playwright install chromium   # once
npm run test:e2e
```

If a Chromium is already installed, point Playwright at it with `PW_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

## Project layout

```
src/
  app/          store, hooks, router, providers, theme, layout
  lib/          firebase.ts (lazy init + emulator wiring)
  services/     api.ts (the single RTK Query api)
  features/     feature-sliced folders (ui, dashboard, transactions, ...)
  components/   shared UI (shadcn-style primitives on Radix)
  utils/        shared helpers (cn; money/dates/currency arrive later)
```

Git hooks (husky + lint-staged) run ESLint and Prettier on staged files at commit time; `npm install` sets them up through the `prepare` script.

## Branching

Work on `phase-<n>-<slug>` branches cut from `develop` and open PRs into `develop`. Promotion is `develop` → `test` → `prod`, each by PR; merging deploys that environment. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
