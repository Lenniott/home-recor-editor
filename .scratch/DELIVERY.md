# Delivery — orchestrator

Pickup and “what’s next” live in `.scratch/CONTINUE.md`. Workers never implement from this file; they get one ticket + `WORKER.md` + that area’s `TDD.md`.

**Do not push or open PRs until the user asks.**

## Roles

| Role | Does | Does not |
|------|------|----------|
| **Orchestrator** | Pick the frontier, assign at most one worker per hotspot, update ticket Status | Write production code for a ticket |
| **Worker** | One ticket, TDD, green suite, stop | Touch other tickets, refactor beyond the slice |
| **Reviewer** (after green) | coupling, leftover comments, extra API | Redesign the slice |

## Hotspot mutex

Workers collide if they share a file. Orchestrator grants the lock. Fill this table when a program starts; delete rows when the program ends.

| Mutex | Typical files | Lanes that take it |
|-------|----------------|--------------------|
| _(none)_ | | |

`FREE` means no mutex: the ticket cannot share files with any in-flight work.

## Locked product decisions

Workers treat these as given. Add rows when a program locks a product choice. Clear the list when that program ends.

_(none)_

## Waves

A **wave** is a set of tickets that may run in parallel because mutexes are disjoint. Merge or finish a wave before starting work that lists those tickets as blockers. Inside a wave, only one holder per mutex.

## Orchestrator loop (every dispatch)

1. Read ticket Status. Skip `done`. Skip if any Blocked by is not `done`.
2. Check mutex: if another in-flight slice holds it, wait.
3. Open worker with: ticket path, `.scratch/WORKER.md`, `.scratch/<area>/TDD.md` section for that NN, locked decisions above.
4. Worker completion: named first-red test went red then green; all ticket ACs have tests; `npm test` and `npm run check` green; rust tickets also cargo tests.
5. Mark ticket done; rewrite `.scratch/CONTINUE.md` Status and Next.
6. Commit the slice and that CONTINUE update only if the user asked (or CONTINUE Status requires it).
7. User message ends with **Manual test**. If nothing in the packaged app changed, `Manual test: none` plus one line why.

## Ticket completeness gate

A ticket is dispatchable only if `TDD.md` lists **Seam**, **First red**, **Prove red**, **Out of scope**. If a worker would have to invent the first test name, stop and patch `TDD.md` before dispatch.

## Ticket shape

Each issue file:

- **What to build** (one paragraph)
- **Blocked by:** ticket names or `None`
- **Status:** `ready-for-agent` \| `done` \| `blocked-*`
- Mutex name matching the table above
- Acceptance criteria as checkboxes
- Footer: follow `WORKER.md` + this area’s `TDD.md` `## NN`

## What the orchestrator forbids

- Two workers on the same mutex at once.
- A worker writing all tests for a ticket then all code (horizontal slice).
