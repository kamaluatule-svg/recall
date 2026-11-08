# 3. Architecture

## 3.1 System context

Four managed services, each doing one job:

```mermaid
flowchart LR
  subgraph Browser["Learner's device (browser or installed PWA)"]
    UI["Recall frontend<br/>HTML · CSS · JS"]
  end
  V["Vercel<br/>static hosting"] -->|serves the app| UI
  UI -->|"1. Continue with Google"| FA["Firebase Authentication"]
  FA -->|"2. signed ID token (JWT)"| UI
  UI -->|"3. HTTPS + Bearer token"| API["Recall API<br/>Render · Node.js"]
  API -.->|"verify signature<br/>(Google public keys)"| JWKS[("Google<br/>signing keys")]
  API -->|"4. queries as service_role"| DB[("Supabase<br/>PostgreSQL")]
```

| Service | Responsibility | Never does |
|---------|----------------|-----------|
| **Vercel** | Serves static files (HTML/JS/CSS/icons) | Holds data or secrets |
| **Firebase Auth** | Proves *who* the user is (Google sign-in), issues short-lived signed tokens | Stores study data |
| **Render API** | Verifies tokens, validates input, applies scheduling, enforces ownership and quotas | Trusts anything the browser claims about identity |
| **Supabase** | Stores profiles, decks, cards and sessions | Is reachable from the browser (RLS denies all) |

## 3.2 Sign-in and first load

```mermaid
sequenceDiagram
  autonumber
  actor L as Learner
  participant B as Browser (Recall UI)
  participant F as Firebase Auth
  participant A as Recall API (Render)
  participant D as Supabase

  L->>B: Click "Continue with Google"
  B->>F: signInWithPopup(Google)
  F-->>B: user + ID token (JWT, ~1 h)
  B->>A: GET /api/v1/bootstrap (Authorization: Bearer token)
  A->>A: Verify RS256 signature, exp, aud, iss, sub
  A->>D: Upsert profile, load decks, cards, sessions (filtered by uid)
  D-->>A: rows
  A-->>B: { user, decks[ cards[] ], sessions[] }
  B-->>L: Dashboard
```

## 3.3 Studying a card

```mermaid
sequenceDiagram
  autonumber
  actor L as Learner
  participant B as Browser
  participant A as Recall API
  participant D as Supabase

  L->>B: Reveal answer, tap "Got it"
  B->>B: Optimistic update (instant UI)
  B->>A: POST /cards/:id/review { correct: true }
  A->>D: Read card (scoped to user)
  A->>A: nextSchedule(card, correct)
  A->>D: Update card (only if seen_count unchanged)
  A-->>B: Updated card (authoritative)
  B->>B: Adopt server values
  Note over B,A: At the end of a session: POST /sessions { day, reviewed, correct }
```

Writes are sent **in order** through a small client-side queue, so "create deck" always reaches the server before "add card to that deck". If any write fails, the app shows a message and reloads the authoritative state from the server so the screen never silently disagrees with the database.

## 3.4 Data model

```mermaid
erDiagram
  PROFILES ||--o{ DECKS : owns
  PROFILES ||--o{ CARDS : owns
  DECKS ||--o{ CARDS : contains
  PROFILES ||--o{ STUDY_SESSIONS : records

  PROFILES {
    text id PK "Firebase UID"
    text email
    text display_name
    text avatar_url
    timestamptz created_at
    timestamptz last_seen_at
  }
  DECKS {
    uuid id PK
    text user_id FK
    text name "1-48 chars"
    text subject "1-32 chars"
    text icon
    timestamptz created_at
  }
  CARDS {
    uuid id PK
    uuid deck_id FK
    text user_id FK
    text question "1-500 chars"
    text answer "1-1000 chars"
    int interval_days "0-30"
    timestamptz due_at "null = due now"
    int seen_count
    int correct_count
  }
  STUDY_SESSIONS {
    uuid id PK
    text user_id FK
    text day "learner-local day key"
    int reviewed
    int correct
    timestamptz created_at
  }
```

Full DDL: [`supabase/schema.sql`](../supabase/schema.sql). Deleting a profile cascades to everything it owns, which is what powers the account-deletion endpoint.

## 3.5 Backend structure

```
backend/src/
├── server.js            # starts HTTP server, graceful shutdown (SIGTERM)
├── app.js               # request pipeline: CORS → rate limit → route → auth → validate → handle
├── config.js            # reads + validates environment (fails fast)
├── auth/firebase.js     # Firebase ID-token verification (node:crypto only)
├── db/supabase.js       # PostgREST client (fetch), paging, timeouts
├── db/repository.js     # all queries, always scoped by user_id
├── routes/index.js      # the route table
├── services/scheduler.js# spaced-repetition rule (pure function)
└── lib/                 # http helpers, router, validation, rate limiter
```

Request pipeline for every call:

```mermaid
flowchart LR
  R[Request] --> C[CORS check] --> RL[Rate limit<br/>per IP] --> RT[Route match] --> AU[Verify Firebase<br/>ID token] --> VA[Validate<br/>input] --> H[Handler → repository<br/>scoped by uid] --> J[JSON response]
```

## 3.6 Deployment topology

```mermaid
flowchart TB
  GH[("GitHub repo<br/>frontend/ · backend/ · docs/")]
  GH -->|"auto-deploy<br/>root: frontend/"| V["Vercel<br/>https://your-app.vercel.app"]
  GH -->|"auto-deploy via render.yaml<br/>root: backend/"| R["Render web service<br/>https://recall-api.onrender.com"]
  V -.->|"calls (CORS-allowlisted)"| R
  R --> S[("Supabase project")]
  V -.-> F["Firebase Auth<br/>(authorised domain)"]
```

Step-by-step instructions: [deployment guide](07-deployment-guide.md).

## 3.7 Design principles

1. **The browser is never trusted.** Identity comes from a verified token, never from a request field.
2. **Least privilege.** The database denies browser roles entirely; only the API holds a key.
3. **Small and explainable.** No runtime dependencies in the API; one scheduling rule; one way in and out of the database.
4. **Fail visibly.** Validation errors name the field; sync errors reach the user and trigger a re-sync.
5. **Keep the UI working.** The original interface and guest mode were kept intact; only the persistence layer changed.

Rationale for each major choice: see the [decision records](adr/).
