# Ledgerly mobile

The Ledgerly app for iOS and Android, built with Expo (React Native) and TypeScript. It talks to
the **same Firebase project** as the web app and reuses the web app's data layer, so accounts,
transactions, budgets, recurring rules and groups are shared between web and phone.

Everything the web app does is here: sign up / sign in (email and Google), accounts and
categories, transactions with filters and tags, transfers, budgets with alerts and rollover,
recurring transactions and subscriptions, groups with split bills and settle-up, the dashboard,
reports, CSV import/export, PDF statements, backup and restore, receipts (behind a flag),
in-app notifications, profile and settings, and light/dark mode.

## How it shares code with the web app

- `@/…` imports resolve to the web app's `../src/…`, unless a file with the same path exists in
  `mobile/src/overrides/…`, which then wins. Overrides replace the few web modules that touch the
  browser (Firebase init with AsyncStorage persistence, the store, auth, the receipt queue).
- `@m/…` imports resolve to `mobile/src/…` (screens, native UI, charts, theme).
- `metro.config.js` (app), `jest.resolver.js` (tests) and `tsconfig.json` (types) implement the
  same rules. Web-only packages (`jspdf`, `jspdf-autotable`) resolve to empty modules; PDF
  statements on mobile are rendered with `expo-print`.

So schemas, money maths, balances, split logic, report selectors, CSV parsing and every RTK
Query endpoint are the web app's own code. A fix there fixes both apps.

## Setup

Requires Node 22 and npm.

```bash
cd mobile
npm ci
cp .env.example .env.local   # then fill it in (see below)
npx expo start
```

Press `a` (Android emulator), `i` (iOS simulator) or scan the QR code with Expo Go. Google
sign-in and some native modules need a development build instead of Expo Go:

```bash
npx expo run:android      # or: npx expo run:ios (macOS + Xcode)
```

### Configuration (`.env.local`)

All values are `EXPO_PUBLIC_*`, baked into the bundle. They are public config, not secrets;
security comes from the Firestore and Storage rules in the repo root.

| Variable                                                 | Where it comes from                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_FIREBASE_*` (6 values)                      | Firebase console → Project settings → General → Your apps → the **Web** app config (same as `VITE_*`).    |
| `EXPO_PUBLIC_USE_EMULATORS`, `EXPO_PUBLIC_EMULATOR_HOST` | `true` to use the local emulators. Host: `10.0.2.2` from the Android emulator, your LAN IP from a phone.  |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                       | Google Cloud console → APIs & Services → Credentials → the "Web client (auto created by Google Service)". |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`                       | Same page → Create credentials → OAuth client ID → iOS, bundle ID `com.ledgerly.app`.                     |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`                   | Same page → OAuth client ID → Android, package `com.ledgerly.app` and your signing key's SHA-1.           |
| `EXPO_PUBLIC_WEB_APP_URL`                                | The deployed web app URL. Group invite links point there so anyone can open them.                         |
| `EXPO_PUBLIC_RECEIPTS_ENABLED`                           | `true` to turn on receipts (Firebase Storage). Off by default, as on the web app.                         |

The Google button is hidden on a platform whose client ID is empty. Email sign-in always works.

### Emulators

From the repo root, `npm run emulators` (see the root README), then set
`EXPO_PUBLIC_USE_EMULATORS=true`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-ledgerly` and the right
`EXPO_PUBLIC_EMULATOR_HOST`.

## Scripts

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm start`            | Expo dev server                                                 |
| `npm run lint`         | ESLint (eslint-config-expo), no warnings allowed                |
| `npm run typecheck`    | `tsc --noEmit` (also type-checks the shared web code it uses)   |
| `npm test`             | Jest (jest-expo) and React Native Testing Library               |
| `npm run format`       | Prettier                                                        |
| `npm run bundle:check` | Bundles for Android and iOS into `dist/`, to catch Metro errors |

CI runs lint, typecheck, test and the bundle check on every PR (`mobile` job in
`.github/workflows/ci.yml`).

## Building for stores

The app has no EAS project yet. To build installable binaries:

1. `npm i -g eas-cli && eas login`
2. `eas init` (creates the project and writes its ID into `app.json`)
3. `eas build --platform android` / `--platform ios`

Set the `EXPO_PUBLIC_*` values for each build profile as EAS environment variables (one set per
Firebase project: dev, test, prod). Change `com.ledgerly.app` in `app.json` first if you want a
different bundle ID; it must match the Google OAuth clients.

## Notifications

There is no backend to send push messages, so notifications are local to the device: bill
reminders for remind-mode recurring rules at 9:00 on the due day, and budget alerts and settle-up
reminders shown as device notifications when they arrive while the app is in the background.
The in-app inbox is shared with the web app.
