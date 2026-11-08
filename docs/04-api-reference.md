# 4. API reference

**Base URL:** `https://<your-render-service>.onrender.com` (local: `http://localhost:8080`)
**Version prefix:** `/api/v1`
**Format:** JSON in and out. `Content-Type: application/json` is required on `POST`/`PATCH`.

## 4.1 Authentication

Every endpoint except `/health` requires a Firebase ID token:

```
Authorization: Bearer <Firebase ID token>
```

The API verifies the token's RS256 signature against Google's published signing keys, then checks `exp`, `iat`, `auth_time`, `aud` (= the Firebase project id), `iss` (= `https://securetoken.google.com/<project id>`) and `sub`. The token's `sub` (Firebase UID) is the only identity the API uses.

## 4.2 Data shapes

```jsonc
// Card
{ "id": "uuid", "q": "Question", "a": "Answer",
  "interval": 4,          // days until next review after the last correct answer (0 = learning)
  "due": 1790000000000,   // epoch ms; 0 = never reviewed, due now
  "seen": 5, "right": 4,  // review counters
  "createdAt": 1789000000000 }

// Deck
{ "id": "uuid", "name": "Cell Biology", "subject": "Biology", "icon": "dna",
  "createdAt": 1789000000000, "cards": [ /* Card */ ] }

// Study session
{ "day": "2026-10-8", "reviewed": 12, "correct": 10 }
```

`icon` is one of: `layers-2, book-open, dna, leaf, landmark, brain, globe-2, microscope, pen-line, palette, laptop`.

## 4.3 Endpoints

| Method | Path | Purpose | Success |
|--------|------|---------|---------|
| GET | `/health` | Liveness probe (public) | `200 { status, time }` |
| GET | `/api/v1/bootstrap` | Everything the app needs on load: user, decks with cards, last 500 sessions. Also creates/refreshes the profile | `200` |
| DELETE | `/api/v1/me` | Delete the account's data (profile, decks, cards, sessions) | `204` |
| POST | `/api/v1/decks` | Create a deck | `201` Deck |
| PATCH | `/api/v1/decks/:id` | Rename / change subject or icon (any subset) | `200` Deck |
| DELETE | `/api/v1/decks/:id` | Delete a deck and its cards | `204` |
| POST | `/api/v1/decks/:deckId/cards` | Add a card | `201` Card |
| PATCH | `/api/v1/cards/:id` | Edit question and/or answer | `200` Card |
| DELETE | `/api/v1/cards/:id` | Delete a card | `204` |
| POST | `/api/v1/cards/:id/review` | Rate a card; server applies the schedule | `200` Card |
| POST | `/api/v1/sessions` | Record a finished study session | `201` Session |

### Request bodies

| Endpoint | Body | Rules |
|----------|------|-------|
| `POST /decks` | `{ name, subject?, icon?, id? }` | `name` 1–48; `subject` 1–32 (default `General`); `id` optional client UUID |
| `PATCH /decks/:id` | any of `name, subject, icon` | at least one field |
| `POST /decks/:deckId/cards` | `{ q, a, id? }` | `q` 1–500; `a` 1–1000 |
| `PATCH /cards/:id` | any of `q, a` | at least one field |
| `POST /cards/:id/review` | `{ correct: boolean }` | strict boolean |
| `POST /sessions` | `{ day, reviewed, correct }` | `day` like `2026-10-8`; `1 ≤ reviewed ≤ 10000`; `0 ≤ correct ≤ reviewed` |

Clients may supply their own `id` (UUID) on create so the UI can update instantly; a duplicate id returns `409`.

## 4.4 Errors

All errors share one shape:

```json
{ "error": { "code": "validation_failed", "message": "Some fields are invalid",
             "details": { "name": "must be at most 48 characters" } } }
```

| Status | `code` | Meaning |
|--------|--------|---------|
| 400 | `bad_request` | Body is not a JSON object |
| 401 | `unauthorized` | Missing, malformed, expired or forged token |
| 404 | `not_found` | Unknown route, or the resource does not exist **or is not yours** |
| 405 | `method_not_allowed` | Path exists, method does not |
| 409 | `conflict` | Duplicate id, or card changed concurrently |
| 413 | `payload_too_large` | Body over 32 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` / `limit_reached` | Bad field values / quota hit (100 decks per user, 1000 cards per deck by default) |
| 429 | `rate_limited` | Over 120 requests/minute/IP (`Retry-After` header set) |
| 502 | `upstream_error` | Database request failed |
| 503 | `auth_unavailable` | Could not fetch Google signing keys |

Another user's resource always returns `404`, never `403`, so ids cannot be probed.

## 4.5 CORS

Only origins listed in `CORS_ORIGINS` receive CORS headers. Allowed headers: `Authorization, Content-Type`. Allowed methods: `GET, POST, PATCH, DELETE, OPTIONS`.

## 4.6 Example

```bash
curl -s https://recall-api.onrender.com/api/v1/decks \
  -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Cell Biology","subject":"Biology","icon":"dna"}'
```
