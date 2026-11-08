# Architecture decision records

Short notes on *why* each major choice was made, with the alternatives we weighed. New decisions get the next number; superseded ones are marked, never deleted.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-api-between-browser-and-database.md) | Put an API between the browser and the database | Accepted |
| [0002](0002-firebase-identity-supabase-data.md) | Firebase for identity, Supabase for data | Accepted |
| [0003](0003-zero-dependency-backend.md) | Backend with no runtime dependencies | Accepted |
| [0004](0004-google-only-sign-in.md) | "Continue with Google" as the only sign-in, plus guest mode | Accepted |
| [0005](0005-in-memory-rate-limit.md) | In-memory rate limiting | Accepted (revisit if scaled out) |
| [0006](0006-server-side-scheduling.md) | Scheduling runs on the server, UI is optimistic | Accepted |
