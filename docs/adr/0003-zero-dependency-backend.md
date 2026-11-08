# ADR-0003: Backend with no runtime dependencies

**Status:** Accepted · **Date:** 2026-11-08

## Context
The API needs routing, JSON handling, Firebase token verification and a Postgres REST client. Typical choices are Express, `firebase-admin` and `@supabase/supabase-js`.

## Options
1. Express + firebase-admin + supabase-js: familiar, more features, ~hundreds of transitive packages.
2. **Node built-ins only** (chosen): `node:http`, `node:crypto`, global `fetch`.

## Decision
Option 2.
- Token verification follows Firebase's documented rules using `node:crypto` against Google's JWK endpoint.
- Supabase is reached through its PostgREST HTTP interface, which is what `supabase-js` wraps.

## Consequences
- ✅ Instant Render builds, small cold start, minimal supply-chain surface (nothing to audit or patch).
- ✅ Every line is ours and small enough to explain in a presentation (under 800 lines in total).
- ✅ Fully testable offline: tests sign real tokens and run a fake PostgREST.
- ❌ We own a tiny router and verifier. Both are covered by tests; migrating to Express/`firebase-admin` later is straightforward because handlers and the repository are isolated.
