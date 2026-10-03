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

| Decision                                             | Reason                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Client-only, Firebase direct                         | Small ops surface; rules give per-document authorisation                                             |
| RTK Query for all Firestore access                   | One cache, consistent loading/error states, real-time via `onSnapshot` with clean unsubscribe        |
| Feature-sliced folders                               | Each feature owns its endpoints, schemas, UI, and tests                                              |
| Integer minor units for money                        | Avoid float rounding; deterministic split allocation                                                 |
| Balances derived from transactions                   | Cached `txTotal` per account, changed with `increment()` in the same batch as each transaction write |
| Multi-doc writes via `writeBatch` / `runTransaction` | Transfers and settlements stay atomic                                                                |
| zod on forms and on Firestore reads                  | Same schema guards user input and stored data                                                        |
| One custom service worker (`injectManifest`)         | Workbox offline caching and FCM push share a single SW                                               |

## Firestore access pattern

`src/services/firestore.ts` connects RTK Query to Firestore:

- `collectionListener` / `docListener` build an endpoint's `queryFn` (first snapshot, served from the offline cache when needed) and `onCacheEntryAdded` (a live `onSnapshot` until the cache entry is removed).
- Every document goes through `toPlain` (Timestamps become ISO strings) and its zod schema. Invalid docs are skipped and reported once. Items carry `id` and `pending` (unsynced local changes).
- `firestoreWrite` returns `{ data }` or `{ error }` with a friendly message. It waits for the server for a short grace period, or not at all while offline; Firestore applies the write locally and syncs later, and a late rejection shows a toast.
- Mutations invalidate the feature's `LIST` tag; the live listener usually updates the cache first.

## Transactions

- **Balances:** an account's balance is `openingBalance + txTotal`. Each side of a transaction moves its account by `amount` when the account holds the transaction currency, otherwise by `baseAmount` (only allowed when that account holds the base currency). Aggregate queries were rejected: they don't run offline, aren't live, and need several queries per account.
- **List:** an RTK Query infinite query with cursor pagination (`startAfter` on the sort field and doc id). Firestore does the type filter, the sort and the date range (date sorts only). Accounts, categories, tags, amount and search are filtered on the client while paging, reading at most 500 docs per page request. Indexes are in `firestore.indexes.json`.
- **Live updates:** a one-doc listener on the newest `updatedAt` invalidates the list when a transaction is added or edited.
- **Undo delete:** rows are hidden in the `transactions` slice, and the delete batch is written after 5 s unless undone.

## Budgets

- **Status is derived, never stored:** `computeBudgetStatus(budget, transactions, period, options)` in `features/budgets/utils.ts` is a pure function. Spend is the `baseAmount` of expenses in the budget's categories (a parent includes its subcategories); an empty `categoryIds` means every expense.
- **Periods are calendar dates** (`yyyy-MM-dd`, end exclusive) in the user's timezone, built by `src/utils/dates.ts` with an explicit IANA timezone, so the maths is testable in any zone. Weekly periods follow `settings.weekStartsOn`.
- **Rollover** carries one period: last period's amount minus its spend (negative when overspent). It never carries from a period that ended before `startDate`, which is set to the start of the previous period when a budget is created, so last period's leftover applies at once.
- **Data:** one live query per page for expenses in the needed date range (`type == expense`, date range; uses the existing type + date index).
- **Alerts:** a listener middleware (`features/budgets/listener.ts`) runs after every transaction create, edit, delete or re-categorise. It checks the current period plus the periods of the written dates and creates missing `users/{uid}/notifications/budget_<budgetId>_<periodKey>_<threshold>` docs, then shows a toast. The doc id is the dedupe key; rules make notifications create-once with only `read` editable afterwards. Respects `notificationPrefs.budgetAlerts`.

## Recurring transactions

- **Engine:** `features/recurring/engine.ts` is pure and works on calendar dates only (`occurrencesBetween`, `nextOccurrence`). Monthly days past a month's end fall on its last day (31 → 30 Apr, 28/29 Feb) without drifting; `byMonthDay: -1` is the last day; yearly 29 Feb falls on 28 Feb in common years. `maxOccurrences` counts from the start and includes skipped occurrences.
- **Timezone:** each rule stores the `timeZone` it was created in. `startDate`, `endDate` and `nextRunAt` are Timestamps at local midnight in that zone (`zonedTime`), read back as calendar dates in the same zone, so travel or DST never moves an occurrence. An occurrence is due from its local midnight and is posted at local noon.
- **`nextRunAt`** is when the first occurrence that is neither posted nor skipped becomes due; `null` means the schedule has ended. Skipped keys before it are pruned.
- **Catch-up runner:** `useRecurringRunner` (mounted in `AppLayout`) runs on start, when the tab becomes visible, when the browser comes back online and every 15 minutes. For each auto rule with `nextRunAt <= now` it calls `runRule` (`features/recurring/runner.ts`): one `runTransaction` that re-reads the rule, reads every due occurrence's doc `${ruleId}_${occurrenceKey}`, creates the missing ones with the account `txTotal` increments, and advances `nextRunAt`. At most 100 per run; the rest waits for the next wake-up and the toast says so. Two tabs or devices racing on the same rule can't double-post: the loser is retried (or refused by the rules, then retried) and finds the docs.
- **Remind mode:** occurrences wait in Recurring › Upcoming & due. Confirm and Skip are transactions too; Confirm can change the amount (the rule's FX rate is kept). Out-of-order confirms are found by id (`in` query, 30 per request).
- **Editing** is "this and future": the template and schedule change for occurrences not yet posted. Changing the pattern or start restarts the schedule from the new start, which can't be before the next unhandled occurrence (or today). Posted transactions are never touched.
- **Budget alerts** run after catch-up posts and confirms (the budgets listener also matches `runRecurring` and `confirmOccurrence`).
- **Rules:** `recurring` docs and their template are validated; a transaction with `recurringId` must have the id `${recurringId}_${occurrenceKey}`, and those fields can't change.

## Data ownership

- `users/{uid}/**` is private to that user.
- `groups/{groupId}/**` is readable and writable by `memberIds` only, with role checks for admin actions.
- `invites/{token}` is readable by the invited email and the group, and accepted once.

## Environments

- **Local:** `VITE_USE_EMULATORS=true` points the app at local Auth, Firestore, and Storage emulators.
- **dev / test / prod:** three separate Firebase projects, deployed by GitHub Actions when PRs merge into `develop`, `test` and `prod`. Config comes from per-environment GitHub secrets. Details in [`DEPLOYMENT.md`](DEPLOYMENT.md).
