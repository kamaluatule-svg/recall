# 5. Security & privacy

## 5.1 Threats considered and controls

| Threat | Control | Evidence |
|--------|---------|----------|
| Forged or tampered token | RS256 signature checked against Google's keys; `alg: none` and unknown `kid` rejected | `auth.test.js` |
| Token for a different Firebase project / expired token | `aud`, `iss`, `exp`, `iat`, `auth_time` validated | `auth.test.js` |
| One user reading or editing another's data | Every query filtered by `user_id` from the verified token; foreign ids return 404 | `api.test.js` tenant-isolation test |
| Browser reading the database directly | RLS enabled on all tables with **no** policies; `anon`/`authenticated` privileges revoked | `supabase/schema.sql` |
| Leaked database key | `service_role` key exists only in Render's environment; never in the repo or browser | repo review; `.gitignore` excludes `.env` |
| Malicious input / oversized bodies | Strict validation, length limits, 32 KB body cap, JSON-only | `api.test.js` |
| Query-string injection into the database layer | Ids validated as UUID / `[A-Za-z0-9_-]{1,128}` before use in filters; values URL-encoded | code review |
| Abuse / scraping | Per-IP rate limit (120/min), per-user quotas | `auth.test.js`, `api.test.js` |
| Cross-site requests from unknown origins | CORS allowlist | `auth.test.js` |
| XSS | All user text escaped when rendered (`esc()`); security headers on the frontend | code review |
| Account takeover | Delegated to Google sign-in; no passwords stored by Recall | design |

## 5.2 Secrets map

| Secret / value | Where it lives | Public? |
|----------------|----------------|---------|
| Supabase `service_role` key | Render environment only | **No: secret** |
| Supabase URL | Render environment | No need to publish |
| Firebase web config (`apiKey`, `projectId`, …) | `frontend/config.js` | Yes: identifiers, not credentials; access is governed by Firebase's authorised domains |
| Firebase ID token | Browser memory (managed by the Firebase SDK) | Short-lived (~1 hour) |

## 5.3 Privacy

- **Data stored per account:** Google display name, email address and photo URL (for the profile header), plus decks, cards, review counters and study-session totals.
- **Not collected:** passwords, contacts, location, analytics trackers.
- **Guest mode:** data never leaves the device (browser local storage).
- **Deletion:** `DELETE /api/v1/me` removes the profile and, by cascade, all decks, cards and sessions. (Removing the Firebase identity itself is done in the Firebase console; an in-app button is on the [roadmap](08-iteration-log.md#roadmap).)

## 5.4 Known limitations (honest list)

- Rate limiting is **in memory** and per instance; fine for one Render instance, would need a shared store if scaled out ([ADR-0005](adr/0005-in-memory-rate-limit.md)).
- The free Render plan **sleeps after inactivity**; the first request after idle can take up to a minute. The UI tells the user it is "waking up the server".
- Tokens are not revocable instantly (they expire within ~1 hour). Acceptable for flashcards; a high-security product would check revocation.
