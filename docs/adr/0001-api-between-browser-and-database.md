# ADR-0001: Put an API between the browser and the database

**Status:** Accepted · **Date:** 2026-11-08

## Context
Versions 2–3 let the browser call Supabase directly with a public key, protected only by row-level security. We now use Firebase for identity, which Supabase's RLS cannot natively verify, and we need server-side rules (scheduling, quotas, validation).

## Options
1. **Browser → Supabase directly** (keep as is). Least code, but needs Supabase to trust Firebase tokens (third-party-auth setup), keeps rules in the client, and exposes the database surface to the internet.
2. **Browser → API → Supabase** (chosen). One trusted place for identity checks and business rules; the database is closed to browsers.
3. Serverless functions per route. Similar benefits, but the brief asks for a backend on Render.

## Decision
Option 2. The API verifies the Firebase token, then talks to Supabase with the `service_role` key.

## Consequences
- ✅ Database credentials never reach the browser; RLS can deny everything as defence in depth.
- ✅ Scheduling, quotas and validation are enforced for every client.
- ✅ Identity provider and database vendor are independently replaceable.
- ❌ One more service to run; free-tier cold starts add latency on first request.
