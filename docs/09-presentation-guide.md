# 9. Presentation guide

A suggested structure that follows the marking logic: **problem → solution → evidence → engineering quality**. Target 10–12 minutes plus questions.

## 9.1 Slide outline

| # | Slide | Key message | Source |
|---|-------|-------------|--------|
| 1 | **Title**: Recall · *make it stick* | One-line promise + team | – |
| 2 | **The problem** | We forget fast; cramming and re-reading do not fix it | [§1.1–1.2](01-problem-statement.md) |
| 3 | **Who feels it** | Three personas: student, self-learner, teacher | [§1.3](01-problem-statement.md) |
| 4 | **Why existing options fall short** | The gap table, ending with the gap sentence | [§1.4](01-problem-statement.md) |
| 5 | **Goals & success criteria** | G1–G5, each measurable | [§1.5](01-problem-statement.md) |
| 6 | **Our solution** | Problem → answer table | [§2.2](02-solution-overview.md) |
| 7 | **How learning works in Recall** | Learner journey + scheduling rule | [§2.4–2.5](02-solution-overview.md) |
| 8 | **Architecture** | Four services diagram; "who does what" | [§3.1](03-architecture.md) |
| 9 | **Sign-in and data flow** | Sequence diagram: token → API → database | [§3.2](03-architecture.md) |
| 10 | **Security** | Threat → control → test table | [§5.1](05-security-and-privacy.md) |
| 11 | **Evidence** | 18/18 backend tests, browser end-to-end, screenshots | [§6](06-testing.md) |
| 12 | **Live demo** | Script below | – |
| 13 | **Iteration & roadmap** | v1 → v4, then what is next | [§8](08-iteration-log.md) |
| 14 | **Thank you / Q&A** | Live URLs + repo | – |

Diagram PNGs for slides are in [`images/`](images/).

## 9.2 Live demo script (3 minutes)

*Before presenting:* open the API `/health` URL once to wake the Render service; be signed out.

1. **Open the Vercel URL.** "Installable web app, hosted on Vercel."
2. **Continue with Google.** "Identity is handled by Firebase; we never see a password."
3. **Create deck** *Cell Biology* → add **3 cards**. "Each save goes through our Render API to Supabase."
4. **Study** the deck: reveal → *Got it* twice, *Study again* once. "Correct answers are scheduled 1, 2, 4… days out. Misses return in 10 minutes."
5. **Show Statistics / dashboard**: accuracy and streak update.
6. **Show Supabase table editor** (second tab): the rows, with the Firebase UID. "Browsers cannot read this: RLS denies everything; only our API can."
7. **Refresh the page / open on a phone.** "Same data on any device."
8. **Sign out → Continue as guest.** "Guests stay local: no account needed to try."

*Fallback if the network fails:* guest mode still works offline after first load; keep the screenshots in `docs/images/` as backup slides.

## 9.3 Likely questions

| Question | Short answer |
|----------|--------------|
| Why a backend at all? Supabase can be called from the browser. | Keeps keys private, enforces scheduling/validation for every client, and lets Firebase and Supabase stay independent ([ADR-0001](adr/0001-api-between-browser-and-database.md)). |
| Why Firebase *and* Supabase? | Firebase answers *who you are*; Supabase stores *what you own* ([ADR-0002](adr/0002-firebase-identity-supabase-data.md)). |
| How do you stop one user seeing another's cards? | Identity comes only from a verified token; every query filters on that uid; tested with seven attack calls; RLS denies browsers entirely. |
| How does the backend know a token is genuine? | Verifies the RS256 signature with Google's public keys and checks audience, issuer and expiry ([§4.1](04-api-reference.md)). |
| Why such a simple scheduling algorithm? | Predictable and testable baseline; adaptive scheduling is on the roadmap with a review-log table to support it ([ADR-0006](adr/0006-server-side-scheduling.md)). |
| What about the slow first load? | Render's free plan sleeps; the UI says "waking up the server". A paid plan or an uptime ping removes it. |
| What would you do with more time? | The [roadmap](08-iteration-log.md#roadmap): delete-account button, review log and charts, shared decks, import/export. |
| Is it tested? | 18 integration tests with real signed tokens and a fake database server, plus a browser end-to-end run ([§6](06-testing.md)). |
| Where is the research behind spaced repetition? | Ebbinghaus (1885); Cepeda et al. (2006); Dunlosky et al. (2013) ([§1.8](01-problem-statement.md)). |

## 9.4 Marking-criteria checklist

- [x] Problem clearly stated, with users and evidence → §1
- [x] Solution mapped one-to-one to the problem → §2.2
- [x] Technical design explained with diagrams → §3
- [x] Security considered and tested → §5, §6
- [x] Working, deployed system (Vercel + Render) → §7
- [x] Process shown, with decisions and iterations → §8, ADRs
- [x] Honest limitations and next steps → §5.4, §8 roadmap
