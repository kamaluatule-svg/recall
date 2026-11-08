# ADR-0002: Firebase for identity, Supabase for data

**Status:** Accepted · **Date:** 2026-11-08

## Context
The project requires Firebase for authentication and Supabase for the database.

## Decision
- Identity = **Firebase Authentication** (Google provider). The Firebase **UID** is the user key everywhere.
- Data = **Supabase PostgreSQL**, normalised into `profiles, decks, cards, study_sessions`.
- Because Firebase UIDs are strings (not UUIDs) and Supabase Auth is not used, `user_id` columns are `text` and reference our own `profiles` table, not `auth.users`.

## Consequences
- ✅ Clean separation: Firebase answers *who*, Supabase answers *what they own*.
- ✅ `profiles` gives one place to cascade-delete everything for a user.
- ❌ Supabase's built-in `auth.uid()` policies are unavailable. We rely on the API plus deny-all RLS instead (see [ADR-0001](0001-api-between-browser-and-database.md)).
- ❌ Old v2/v3 rows keyed by Supabase Auth ids are not carried over.
