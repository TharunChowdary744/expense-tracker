# CLAUDE.md — Ledgerly

This file is the single source of truth for building Ledgerly. Read it before every task. If anything here conflicts with another doc, this file wins. Change it only with the owner's agreement.

Working roles: senior product architect, senior React/TypeScript engineer, Firebase specialist, and QA lead.

## 1. Product

Ledgerly is a production-quality personal and group expense tracker, delivered as a web app and installable PWA.

**In scope**

- Accounts, categories, and transactions (expense, income, transfer)
- Budgets with alerts and optional rollover
- Recurring transactions (auto-post or remind)
- Split bills with groups, and settle-up
- Reports and exports
- Receipts (file attachments)
- PWA with offline support
- Notifications (in-app and push via FCM)
- Multi-currency with a per-user base currency
- Dark mode

**Hard constraints**

- **No AI features of any kind.**
- **No custom backend.** The client talks directly to Firebase: Auth, Firestore, Storage, Cloud Messaging. The app is hosted on GitHub Pages.
- Security is enforced only by Firestore and Storage security rules, so **rules are first-class code**: versioned, reviewed, and tested.

## 2. Tech stack (fixed)

Do not substitute any of these without asking the owner first.

| Area | Choice |
| --- | --- |
| Build / language | Vite, React 18+, TypeScript with `strict: true` and `noUncheckedIndexedAccess: true` |
| State and data | Redux Toolkit + RTK Query |
| Firebase | Modular SDK v10+, tree-shakable imports only |
| Routing | React Router data router, lazy-loaded routes |
| UI | Tailwind CSS, shadcn/ui (Radix), lucide-react icons |
| Forms and validation | react-hook-form + zod for every form; zod also validates Firestore docs on read |
| Dates and charts | date-fns, Recharts |
| PWA | vite-plugin-pwa with the `injectManifest` strategy and a custom service worker, so FCM and Workbox share one SW |
| Unit / component tests | Vitest + React Testing Library |
| E2E tests | Playwright |
| Rules tests | `@firebase/rules-unit-testing` against the Firebase Emulator Suite |
| Code quality | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, husky, lint-staged |

### Data access rules

- All Firestore access goes through RTK Query endpoints using `fakeBaseQuery` + `queryFn`.
- Real-time data uses `onCacheEntryAdded` with `onSnapshot`, and unsubscribes when `cacheEntryRemoved` resolves.
- Plain UI state lives in RTK slices.
- **No component calls Firestore directly.**

## 3. Architecture rules

### Folder layout (feature-sliced)

```
src/
  app/                 store, router, providers, layout
  lib/                 firebase.ts (init), emulator wiring
  services/api.ts      the single createApi (tagTypes); feature endpoints are injected
  features/<feature>/
    api.ts             injected endpoints
    slice.ts           UI state
    components/
    pages/
    hooks/
    schemas.ts         zod schemas
    utils.ts
    types.ts
  components/ui/       shared UI (shadcn)
  utils/               money, dates, currency
```

### Money

- Always stored as **integer minor units** (paise, cents) together with an ISO currency code.
- **Never use floats for money.**
- One module, `src/utils/money.ts`, owns parsing, formatting (`Intl.NumberFormat`), and allocating remainders when splitting.

### Dates

- Stored as Firestore `Timestamp`.
- Displayed in the user's locale and timezone.

### Firestore documents

- Every doc has `createdAt`, `updatedAt` (both `serverTimestamp()`) and `createdBy`.
- Writes that touch multiple docs (transfers, settlements, balance updates) use `writeBatch` or `runTransaction`.
- Account balances are **derived from transactions**, not stored. A cached balance field is allowed only if performance requires it, and it must be updated in the same batch as the transaction.

### Configuration

- Env config via `import.meta.env.VITE_FIREBASE_*`.
- `.env.example` is committed; `.env.local` is git-ignored.
- `VITE_USE_EMULATORS` connects to the local emulators in dev.
- Three Firebase projects (dev, test, prod), one per GitHub Environment. CI/CD secrets live only in GitHub Environment secrets; see `docs/DEPLOYMENT.md`.

### UX baseline

- **Accessibility:** everything keyboard reachable, all inputs labelled, focus managed in dialogs, WCAG AA contrast in both light and dark themes.
- **Layout:** mobile-first responsive; bottom nav on mobile, sidebar on desktop.
- A floating **"+" quick-add** button on every main screen.
- Every list has a **loading skeleton**, an **empty state**, and an **error state with retry**.

## 4. Data model (Firestore)

All amounts are integer minor units. `?` marks an optional field.

### User-owned data

**`users/{uid}`**
- `displayName`, `email`, `photoURL`
- `settings`: `{ baseCurrency, theme, locale, dateFormat, weekStartsOn, notificationPrefs }`
- `fcmTokens[]`

**`users/{uid}/accounts/{id}`**
- `name`, `type` (`cash | bank | card | wallet | other`), `currency`, `openingBalance`, `color`, `icon`, `archived`

**`users/{uid}/categories/{id}`**
- `name`, `kind` (`expense | income`), `icon`, `color`, `parentId?`, `order`, `archived`

**`users/{uid}/transactions/{id}`**
- `type` (`expense | income | transfer`), `amount`, `currency`, `fxRateToBase`, `baseAmount`
- `accountId`, `toAccountId?` (transfers), `categoryId?`
- `tags[]`, `payee`, `note`, `date`, `attachments[]`
- `recurringId?`, `occurrenceKey?`, `groupExpenseRef?`

**`users/{uid}/budgets/{id}`**
- `name`, `period` (`weekly | monthly`), `categoryIds[]` (empty = overall budget), `amount`, `rollover`, `alertThresholds` (default `[80, 100]`), `startDate`

**`users/{uid}/recurring/{id}`**
- `template` (transaction fields)
- `frequency` (`daily | weekly | monthly | yearly`), `interval`, `byWeekday?`, `byMonthDay?`
- `startDate`, `endDate?`, `maxOccurrences?`, `nextRunAt`, `lastRunAt`
- `mode` (`auto | remind`), `paused`, `skippedKeys[]`

**`users/{uid}/notifications/{id}`**
- `type`, `title`, `body`, `link`, `read`, `createdAt`

### Shared (group) data

**`groups/{groupId}`**
- `name`, `currency`, `memberIds[]`
- `members`: `{ [uid]: { displayName, email, role } }`
- `invitedEmails[]`, `simplifyDebts`, `createdBy`

**`groups/{groupId}/expenses/{id}`**
- `description`, `amount`, `currency`, `date`, `categoryId?`
- `paidBy`: `{ [uid]: amount }`
- `splitType` (`equal | exact | percent | shares`), `splitInput`: `{ [uid]: number }`
- `shares`: `{ [uid]: amount }`
- `note`, `attachments[]`

**`groups/{groupId}/settlements/{id}`**
- `fromUid`, `toUid`, `amount`, `date`, `note`

**`groups/{groupId}/activity/{id}`**
- `actorUid`, `action`, `summary`, `createdAt`

**`invites/{token}`**
- `groupId`, `invitedEmail`, `invitedBy`, `expiresAt`, `acceptedBy?`

### Invariants

- For every group expense: **`sum(paidBy) == amount == sum(shares)`**.

## 5. Working agreement

1. **Plan first.** For each phase, first reply with a short plan: files to create or change, data/rules changes, and risks. Wait for the owner's "go" only if they ask for that; otherwise proceed.
2. **Branching.** Work on a branch named `phase-<n>-<slug>`, cut from `develop`, and open the PR into `develop`. Commit in small, logical commits with Conventional Commit messages. Promotion is `develop` → `test` → `prod`, each by PR; merging deploys that environment (see `docs/DEPLOYMENT.md`). Never push directly to `develop`, `test` or `prod`.
3. **Tight scope.** Build only what the phase asks. Put other ideas in `docs/BACKLOG.md` instead of building them.
4. **Tests alongside code:** unit tests for utils and reducers, component tests for forms, rules tests for any rule change.
5. **Definition of done.** Before saying "done", run all of these and fix every failure:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
6. **Phase hand-off.** Finish every phase with:
   - (a) a summary of what changed
   - (b) any manual Firebase console steps the owner must do
   - (c) the exact manual test checklist for the owner
   - (d) known limitations

   Then **stop and wait** for the owner.
7. **Never:** commit secrets; disable lint rules or TypeScript checks to make things pass; weaken security rules without telling the owner.
8. **Decisions.** Ask the owner when a product decision is genuinely ambiguous. Otherwise choose the sensible default and state it.

## 6. Related docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): short architecture overview
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): branches, environments, CI/CD and secrets
- [`docs/BACKLOG.md`](docs/BACKLOG.md): ideas and deferred work
