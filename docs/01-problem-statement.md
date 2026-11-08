# 1. Problem statement

## 1.1 The problem in one sentence

> Learners forget most of what they study unless they review it at the right moments, but the tools that schedule those reviews are either too heavy to start using or do not follow the learner across their devices.

## 1.2 Background

**Forgetting is normal, and it is fast.** Hermann Ebbinghaus's 1885 memory experiments showed that retention drops steeply soon after learning and then levels off. Re-reading notes feels productive, but it does little to stop that decay.

**Two techniques reliably beat re-reading.** A large review of study techniques (Dunlosky et al., 2013) rated two of them as "high utility":

- **Practice testing (retrieval practice)**: trying to recall the answer before looking at it.
- **Distributed practice (spaced repetition)**: spreading reviews over time rather than cramming them together (see also Cepeda et al., 2006).

**Flashcards are the natural vehicle** for both, since each card is a small recall test. The hard part is *deciding when each card should come back*. Doing that by hand with paper cards is tedious and error-prone.

## 1.3 Who has the problem

| Persona | Situation | Pain |
|---------|-----------|------|
| **Amaka, university student** | Revises for exams from lecture notes on a phone and a laptop | Crams the week before; forgets earlier topics; cannot remember what to revisit |
| **Tunde, self-taught developer** | Learns terms and concepts in 15-minute gaps | Needs something instant to open; will not configure a complex tool |
| **Ms. Bello, secondary-school teacher** | Wants students to practise vocabulary at home | Needs a tool students can use free, with no installs and no setup |

## 1.4 Why current options fall short

| Option | Gap for our personas |
|--------|----------------------|
| Paper flashcards | No scheduling; easy to lose; cannot be searched |
| Re-reading notes / highlighting | Passive; weak at long-term retention |
| Powerful spaced-repetition desktop tools | Capable but configuration-heavy; steep onboarding for casual learners |
| Generic note apps | Store information but do not test recall or schedule review |
| Local-only web apps | Data is trapped in one browser: clear the cache and the progress is gone |

**The gap:** a lightweight tool that (a) makes recall practice effortless, (b) schedules reviews automatically, and (c) keeps progress safe and available on every device.

## 1.5 Goals

| ID | Goal | How we will know (acceptance criteria) |
|----|------|------------------------------------------|
| G1 | Make starting effortless | A new user signs in with Google and studies a first card in under 2 minutes; guest mode needs no account |
| G2 | Schedule reviews automatically | Correct answers return after 1, 2, 4, 8… up to 30 days; missed cards return in 10 minutes; verified by automated tests |
| G3 | Progress must never be trapped on one device | Decks, cards, schedules and session history survive a reload and sign-in from another browser |
| G4 | Protect each learner's data | One user can never read or change another's data (tested); no secrets in the browser |
| G5 | Be reachable and installable | Hosted over HTTPS, installable as a PWA, usable on a phone-width screen |

## 1.6 Scope

**In scope:** Google sign-in, decks, cards, spaced-repetition scheduling, study sessions, statistics, guest mode, PWA install, cloud sync, deployable backend and frontend.

**Out of scope (for this release):** shared/public decks, importing from other tools, rich media on cards, push-notification reminders, adaptive per-card difficulty. See the roadmap in the [iteration log](08-iteration-log.md).

## 1.7 Constraints and assumptions

- **Identity:** Firebase Authentication (Google provider).
- **Data:** Supabase (PostgreSQL).
- **Hosting:** frontend on Vercel, backend on Render (free tiers, so cold starts are expected).
- Learners are online when signing in; guest mode works offline after the first visit.

## 1.8 References

- Ebbinghaus, H. (1885). *Über das Gedächtnis* (*Memory: A Contribution to Experimental Psychology*).
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354–380.
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4–58.
