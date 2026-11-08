# ADR-0006: Scheduling runs on the server; the UI is optimistic

**Status:** Accepted · **Date:** 2026-11-08

## Context
The review schedule used to be computed only in the browser. With multiple devices and a shared database, the browser's clock and code version could disagree.

## Decision
`POST /cards/:id/review` receives only `{ correct }` and computes interval, due time and counters on the server using the server clock. The browser applies the same rule locally for instant feedback, then overwrites it with the server's response.

## Consequences
- ✅ Single source of truth; algorithm upgrades ship without redeploying the frontend.
- ✅ Clients cannot write arbitrary due dates or counters.
- ✅ Concurrent reviews are safe: the update only applies if `seen_count` is unchanged, with up to three retries.
- ❌ The rule exists in two places (server authoritative, client optimistic). The client always adopts the server result, so drift self-heals.
