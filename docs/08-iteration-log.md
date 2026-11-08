# 8. Iteration log (living document)

Each iteration records **intent → change → evidence → learning**. Add a new entry at the top of the table for every release.

## Summary

| Iteration | Theme | Status |
|-----------|-------|--------|
| [v4](#v4--full-stack-firebase--render--supabase--vercel) | Full stack: Firebase auth, Render API, Supabase database, Vercel frontend, documentation | ✅ Built and tested; deploy by following the guide |
| [v3](#v3--installable-pwa-and-polish) | Installable PWA, responsive polish, Google sign-in via Supabase | ✅ Done (inherited) |
| [v2](#v2--accounts-and-cloud-sync) | Accounts and cloud sync (single JSON row per user) | ✅ Done (inherited) |
| [v1](#v1--local-first-prototype) | Local-first prototype | ✅ Done (inherited) |
| [Roadmap](#roadmap) | Next ideas | 🔜 |

---

## v4: Full stack (Firebase + Render + Supabase + Vercel)

**Intent.** Turn the browser-only app into a proper full-stack product that can be deployed and defended in a presentation: real backend, separate identity provider, structured data, and documentation.

**Why.** In v2/v3 the browser talked to the database directly with a public key. That worked for a prototype but left no place for server-side rules (scheduling, quotas, validation) and tied identity to the database vendor. See [ADR-0001](adr/0001-api-between-browser-and-database.md).

**Changes**

| Area | Change |
|------|--------|
| Auth | Supabase Auth → **Firebase Authentication**, **Google-only** ("Continue with Google"); email/password form removed; guest mode kept |
| Backend | New Node.js API (`backend/`), zero runtime dependencies, verifies Firebase ID tokens itself, deployable to **Render** |
| Database | Single JSON blob per user → **normalised tables** (`profiles, decks, cards, study_sessions`) with RLS deny-all; accessed only by the API |
| Scheduling | Moved to the **server** (authoritative); the browser updates optimistically and adopts the server's answer |
| Frontend | Persistence layer replaced (`backend.js` + changes to `app.js`); UI unchanged. Ordered write queue, error toast + automatic re-sync, "waking up the server" message, load-error screen with retry |
| Service worker | Now **network-first** for app files so new deploys appear immediately; cache version bumped to v19 |
| Repo | Monorepo: `frontend/`, `backend/`, `supabase/`, `docs/`, `e2e/`; `render.yaml`; `frontend/vercel.json` |
| Cleanup | Removed the stale duplicate root app (older copy of the frontend) and the unused `style.css` |
| Docs | This documentation set and 6 decision records |

**Evidence.** 18/18 backend tests; 7/7 browser end-to-end steps with 0 JavaScript errors ([§6](06-testing.md)).

**Learnings / trade-offs**
- No npm dependencies keeps the Render deploy instant and the attack surface small, at the cost of writing a small router and token verifier ourselves ([ADR-0003](adr/0003-zero-dependency-backend.md)).
- Firebase UIDs are text, not Supabase UUIDs, so the schema has its own `profiles` table instead of referencing `auth.users` ([ADR-0002](adr/0002-firebase-identity-supabase-data.md)).
- Existing data from v2/v3 (`recall_data`, keyed by Supabase Auth users) is **not migrated**: those users have no Firebase identity to map to. If real data must be kept, a one-off script is needed (open item).

**Definition of done for this iteration:** [deployment guide §7 smoke test](07-deployment-guide.md#7-post-deploy-smoke-test) passes on live URLs. *Record URLs and date here when done:*

| Item | Value |
|------|-------|
| Frontend URL | _to fill after deploy_ |
| API URL | _to fill after deploy_ |
| Smoke test date / result | _to fill after deploy_ |

---

## v3: Installable PWA and polish

- Web app manifest, icons, service worker (offline launch of the app shell)
- Responsive navigation drawer, deck and flashcard library pages, sliders, loading states
- Google sign-in through Supabase's OAuth broker

## v2: Accounts and cloud sync

- Supabase Auth (email/password), one `recall_data` row per user holding all decks as JSON
- Row-level security so each user only reads their own row
- Guest mode retained for local use

## v1: Local-first prototype

- Decks and cards in browser `localStorage`
- Study mode with *Got it* / *Study again*, doubling-interval scheduling, stats and streak
- `checks.js` smoke checks for core study behaviour

---

## Roadmap

| Priority | Idea | Why |
|----------|------|-----|
| High | In-app **Delete account** (calls `DELETE /me`, then removes the Firebase user) | Completes the privacy story |
| High | **Review log table** (one row per rating) | Enables forgetting-curve charts and better algorithms |
| Medium | Adaptive scheduling (ease factor per card, SM-2 style) | Better retention for hard cards |
| Medium | Import/export (CSV) | Lower switching cost |
| Medium | Shared decks via link | Teachers (persona: Ms. Bello) |
| Low | Reminder notifications (web push) | Habit formation |
| Low | Shared rate-limit store (Redis) if the API is scaled out | See [ADR-0005](adr/0005-in-memory-rate-limit.md) |
| Low | Uptime ping to avoid free-tier sleep | UX on first load |
