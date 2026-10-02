# Backlog

Ideas and deferred work noted during phases instead of being built. Each item is reviewed with the owner before it is scheduled.

| #   | Idea                                       | Why / context                                                                                                                                                                        | Noted in phase | Status |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ |
| 1   | Reset the RTK Query cache on sign-out      | Phase 2 has no per-user queries yet. Once data endpoints exist, clear them when the uid changes, keeping the `authState` subscription alive (a plain `resetApiState` would drop it). | phase-2        | idea   |
| 2   | Sign out of all devices                    | Needs refresh-token revocation, which requires the Admin SDK (no custom backend). "Sign out of all tabs" covers this browser only.                                                   | phase-2        | idea   |
| 3   | Require a verified email in security rules | Verification is enforced in the UI only; adding `request.auth.token.email_verified` to rules would also block unverified API access. Google accounts are always verified.            | phase-2        | idea   |
| 4   | Split the Firebase SDK chunk               | The shared Firebase chunk is about 800 kB before gzip; consider manual chunks for auth, firestore and storage.                                                                       | phase-2        | idea   |
| 5   | Resize avatars client-side before upload   | Uploads are limited to 2 MB as-is.                                                                                                                                                   | phase-2        | idea   |

Status values: `idea`, `accepted`, `scheduled (phase-n)`, `rejected`.
