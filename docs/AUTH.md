# Authentication, first sign-in and rules (phase 2)

## Flow

- `src/features/auth/api.ts` injects the auth endpoints into the single RTK Query api. `authState` subscribes to `onAuthStateChanged` (via `onCacheEntryAdded`) and writes serialisable fields to the `auth` slice. `status` stays `loading` until the first event, so guards never flash a redirect.
- `PublicOnlyRoute` wraps sign-in, sign-up and forgot-password. `ProtectedRoute` wraps the app. Email/password accounts must verify their email first (`/verify-email`); Google accounts are verified already.
- A protected URL redirects to `/sign-in` with `state.from`. The sign-in page also keeps it in `sessionStorage` so it survives the Google redirect flow (mobile and installed PWA). Only same-origin app paths are accepted. After an explicit sign-out the next sign-in starts at the dashboard.
- Google sign-in uses a popup on desktop browsers and a redirect on mobile or in a standalone PWA (and falls back to redirect if the popup is blocked).

## First sign-in seeding

`ensureUserBootstrap` (`bootstrap.ts`) runs from the auth listener on every sign-in:

1. If `users/{uid}` exists it does nothing.
2. Otherwise one `writeBatch` creates `users/{uid}` (default settings, `baseCurrency` from the browser locale region, INR when unknown), the 12 default categories and one Cash account, all with fixed ids and `createdAt`, `updatedAt`, `createdBy`.

Concurrent calls in one tab share a promise. It runs in the background so the app stays usable offline; a failed attempt is retried on the next load.

## Security rules v1

- `firestore.rules`: `users/{uid}` and every subcollection are readable and writable only when `request.auth.uid == uid`. Everything else is denied.
- `storage.rules`: only `users/{uid}/avatar`, owner only, JPEG/PNG/WebP up to 2 MB. Everything else is denied.
- Tests live in `rules-tests/` and run with `npm run test:rules` (Firebase emulators, Java 21+). CI runs them in the `rules` job. `bootstrap.test.ts` runs the real seeding code against the real rules.

## Firebase console setup (per project: dev, test, prod)

1. **Authentication → Sign-in method**: enable **Email/Password** (leave "Email link" off) and **Google** (set the public-facing name and support email).
2. **Authentication → Settings → Authorized domains**: keep `localhost`, the project's `*.firebaseapp.com` domain, add `tharunchowdary744.github.io` (GitHub Pages hosting) and every custom domain you serve the app from.
3. **Authentication → Templates**: optionally customise the verification and password-reset emails and set the sender name.
4. **Firestore** and **Storage**: create the database and bucket if they do not exist. Rules are not deployed on merge; see [Firebase rules and indexes](DEPLOYMENT.md#firebase-rules-and-indexes).
