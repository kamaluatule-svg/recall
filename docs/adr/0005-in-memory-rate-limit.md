# ADR-0005: In-memory rate limiting

**Status:** Accepted, revisit if scaled out · **Date:** 2026-11-08

## Context
The API is public and needs basic abuse protection.

## Decision
Fixed-window limiter in process memory, keyed by client IP (`X-Forwarded-For` first hop on Render), default 120 requests/minute. Per-user quotas (decks, cards) are enforced in the database layer.

## Consequences
- ✅ No extra infrastructure; sufficient for a single Render instance.
- ❌ Counters reset on restart and are not shared across instances. If the service is scaled horizontally, move the counters to Redis (or use the platform's edge rate limiting).
