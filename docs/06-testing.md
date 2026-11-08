# 6. Testing & verification

## 6.1 Strategy

| Level | What it proves | Where | Run |
|-------|----------------|-------|-----|
| **Backend integration (18 tests)** | The real API code, real Firebase-token verification and the real Supabase client behave correctly end to end | `backend/test/` | `cd backend && npm test` |
| **Browser end to end** | The real frontend, in Chromium, signs in, writes through the API, studies, reloads and signs out | `e2e/browser-flow.mjs` | `cd e2e && npm i && npx playwright install chromium && npm run e2e` |
| **Manual production smoke test** | Live Vercel + Render + Firebase + Supabase are wired together | [deployment guide §7](07-deployment-guide.md#7-post-deploy-smoke-test) | by hand |

### How the backend tests avoid mocks of our own code
- Tests **generate an RSA key pair** and sign genuine RS256 tokens; the API verifies them exactly as it would Firebase's.
- A **fake PostgREST server** (HTTP, in-memory) stands in for Supabase, so the real `supabase.js` builds real URLs, headers, paging and `Prefer` options against it.
- Only the *outermost* services (Google's key endpoint and the Supabase host) are substituted.

## 6.2 Backend test inventory

| Area | Test | Goal |
|------|------|------|
| Auth | Health endpoint is public | G5 |
| Auth | Missing / malformed credentials → 401 | G4 |
| Auth | Bad signature, expired, wrong audience, wrong issuer, unknown key id, `alg: none` → 401 | G4 |
| Auth | Valid token accepted; profile row created | G3 |
| Security | CORS allowlist and preflight | G4 |
| Security | Rate limiter returns 429 + `Retry-After` | G4 |
| Data | Deck and card lifecycle round-trips through `bootstrap` | G3 |
| Data | Client-supplied ids honoured; duplicates → 409 | G3 |
| Data | Validation → 422 with per-field messages | G4 |
| Data | Non-JSON → 415; oversized → 413 | G4 |
| Isolation | **User B cannot read, edit, review or delete User A's data** (7 attack calls) | G4 |
| Scheduling | Intervals 1, 2, 4, 8, 16, 30, 30; a miss resets to 0 with ~10-minute due time | G2 |
| Scheduling | Scheduler is a pure function | G2 |
| Sessions | Stored and returned oldest-first | G3 |
| Quotas | Deck and card limits enforced | G4 |
| Privacy | Deck delete cascades to cards; account delete removes everything | G4 |
| Routing | 404 unknown route, 405 wrong method, 404 malformed id | – |
| Secrets | Service key never appears in a response | G4 |

## 6.3 Latest results

| Suite | Result | Date |
|-------|--------|------|
| Backend (`npm test`) | **18 / 18 passing** | 2026-11-08 |
| Browser end to end | **7 / 7 steps passing, 0 JavaScript errors** | 2026-11-08 |

Browser flow verified: landing → Google-only sign-in modal (no email form) → sign-in → deck + card persisted in the database → review gives `interval = 1 day` and a saved session → full reload restores state from the API → sign-out.

## 6.4 What is *not* covered (yet)

- Live Firebase and Supabase are not called by the automated tests (they need your credentials); the [smoke test](07-deployment-guide.md#7-post-deploy-smoke-test) covers them after deployment.
- No load testing; the free tier is sized for demos and small cohorts.
- No automated accessibility audit; keyboard navigation and focus handling were inherited from the original UI.
