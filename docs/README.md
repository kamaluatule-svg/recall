# Recall documentation

Documentation is organised in the order a reader (or a panel) needs it: **why** → **what** → **how** → **proof** → **ship**.

| # | Document | Answers |
|---|----------|---------|
| 1 | [Problem statement](01-problem-statement.md) | What problem are we solving, for whom, and how will we know it is solved? |
| 2 | [Solution overview](02-solution-overview.md) | What is Recall, what can a learner do, and why does it fit the problem? |
| 3 | [Architecture](03-architecture.md) | How do Vercel, Render, Firebase and Supabase fit together? |
| 4 | [API reference](04-api-reference.md) | What can the backend do, and what does each call return? |
| 5 | [Security & privacy](05-security-and-privacy.md) | How is user data protected? |
| 6 | [Testing & verification](06-testing.md) | What evidence shows it works? |
| 7 | [Deployment guide](07-deployment-guide.md) | How do I put it live on Render + Vercel? |
| 8 | [Iteration log](08-iteration-log.md) | How did the project evolve, and what is next? (**living document**) |
| 9 | [Presentation guide](09-presentation-guide.md) | Slide outline, live-demo script, likely questions |
| – | [Decision records](adr/) | Why each major technical choice was made |

## How these docs stay iterative

Every change to the product follows the same loop, and leaves a trace here:

1. **Record intent**: add or update an entry in the [iteration log](08-iteration-log.md) (what and why).
2. **Record decisions**: if a choice had real alternatives, add an [ADR](adr/).
3. **Build and test**: update the [API reference](04-api-reference.md) and [testing](06-testing.md) when behaviour changes.
4. **Close the loop**: mark the log entry *Done* with the evidence (test run, screenshot, deploy URL).

Diagrams are written in [Mermaid](https://mermaid.js.org) so they render on GitHub and diff cleanly; PNG exports live in [`images/`](images/).
