# Continue

Read this file when the user says **continue**, **delivery**, **TDD**, or **architecture tightening**. Do not wait for a ticket number.

**Done when:** one dispatchable ticket is TDD-green, ticket Status is `done`, **this file’s Status/Next are rewritten**, and the reply ends with **Manual test**.

## Steps

1. Stay on the current git branch unless Status names another.
2. Scan `.scratch/*/issues/*.md` for `Status: ready-for-agent` whose **Blocked by** tickets are `done`.
3. Take **one** ticket from **Next** below with a free mutex. A second ticket in the same session only if mutexes are disjoint.
4. Open that ticket, `.scratch/WORKER.md`, and `## NN` in that area’s `TDD.md`. TDD: red then green. Vocabulary: module, interface, seam, adapter.
5. Mark the ticket `done`. Rewrite **Status** and **Next** here so the next session needs no briefing.
6. Commit code + this handoff together only if the user asked to commit (or Status says to). Push only if they asked.
7. End the user message with **Manual test** (see `.scratch/DELIVERY.md`).

## Status

| Item | State |
|------|--------|
| Branch | current |
| Latest | workflow only — no in-flight program |
| Frontier | none |

## Next

_(empty)_

When starting a program: add area folders with `TDD.md` + `issues/`, grant mutexes in `DELIVERY.md`, put one ready ticket path in **Next**.

## Pointers

- Orchestrator / mutex: `.scratch/DELIVERY.md`
- One-ticket TDD: `.scratch/WORKER.md`
- First red: `.scratch/<area>/TDD.md`
- Tickets: `.scratch/<area>/issues/`
