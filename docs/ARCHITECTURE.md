# Ledgerly architecture

A short overview. The authoritative rules live in [`CLAUDE.md`](../CLAUDE.md).

## Shape of the system

```
Browser / installed PWA
  React UI (components, pages)
     │  hooks only, never Firestore directly
  Redux store
     ├─ RTK slices ............ UI state
     └─ RTK Query api ......... server state (fakeBaseQuery + queryFn,
                                  onSnapshot via onCacheEntryAdded)
     │
  Firebase modular SDK (src/lib/firebase.ts)
     │
Firebase: Auth · Firestore · Storage · Cloud Messaging · Hosting
     └─ Firestore & Storage security rules = the only backend authority
```

There is no custom server. Anything that must be trusted is enforced by security rules, which are tested with `@firebase/rules-unit-testing` against the Emulator Suite.

## Key decisions

| Decision                                             | Reason                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Client-only, Firebase direct                         | Small ops surface; rules give per-document authorisation                                      |
| RTK Query for all Firestore access                   | One cache, consistent loading/error states, real-time via `onSnapshot` with clean unsubscribe |
| Feature-sliced folders                               | Each feature owns its endpoints, schemas, UI, and tests                                       |
| Integer minor units for money                        | Avoid float rounding; deterministic split allocation                                          |
| Balances derived from transactions                   | One source of truth; optional cached field only if updated in the same batch                  |
| Multi-doc writes via `writeBatch` / `runTransaction` | Transfers and settlements stay atomic                                                         |
| zod on forms and on Firestore reads                  | Same schema guards user input and stored data                                                 |
| One custom service worker (`injectManifest`)         | Workbox offline caching and FCM push share a single SW                                        |

## Firestore access pattern

`src/services/firestore.ts` connects RTK Query to Firestore:

- `collectionListener` / `docListener` build an endpoint's `queryFn` (first snapshot, served from the offline cache when needed) and `onCacheEntryAdded` (a live `onSnapshot` until the cache entry is removed).
- Every document goes through `toPlain` (Timestamps become ISO strings) and its zod schema. Invalid docs are skipped and reported once. Items carry `id` and `pending` (unsynced local changes).
- `firestoreWrite` returns `{ data }` or `{ error }` with a friendly message. It waits for the server for a short grace period, or not at all while offline; Firestore applies the write locally and syncs later, and a late rejection shows a toast.
- Mutations invalidate the feature's `LIST` tag; the live listener usually updates the cache first.

## Data ownership

- `users/{uid}/**` is private to that user.
- `groups/{groupId}/**` is readable and writable by `memberIds` only, with role checks for admin actions.
- `invites/{token}` is readable by the invited email and the group, and accepted once.

## Environments

- **Local:** `VITE_USE_EMULATORS=true` points the app at local Auth, Firestore, and Storage emulators.
- **dev / test / prod:** three separate Firebase projects, deployed by GitHub Actions when PRs merge into `develop`, `test` and `prod`. Config comes from per-environment GitHub secrets. Details in [`DEPLOYMENT.md`](DEPLOYMENT.md).
