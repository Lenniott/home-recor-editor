# Continue delivery work

Read this file when the user says **continue**, **delivery**, **TDD tickets**, or **architecture tightening**. Do not wait for a ticket number.

**Done when:** one dispatchable ticket is TDD-green, ticket Status is `done`, **this file’s Status/Next are rewritten**, a commit exists on `tdd/program`, and the reply ends with **Manual test**.

## Steps

1. Confirm git branch `tdd/program`.
2. Scan `.scratch/*/issues/*.md` for `Status: ready-for-agent` whose **Blocked by** tickets are `done`.
3. Take **one** ticket from **Next** below with a free mutex. A second ticket in the same session only if mutexes are disjoint.
4. Open that ticket, `.scratch/WORKER.md`, and `## NN` in that area’s `TDD.md`. TDD: red then green. Vocabulary: module, interface, seam, adapter.
5. Implement on `tdd/program`. Extra branches only if the user asks to split PRs.
6. Mark the ticket `done`. Rewrite **Status** and **Next** in this file so the next session needs no briefing. If the wave completed, say so in Status.
7. Commit code + this handoff together. Do not ask the user to update docs for the next agent; that is this step. Push only if they asked.
8. End the user message with **Manual test** (see `DELIVERY.md`).

## Status (2026-09-14)

| Item | State |
|------|--------|
| Branch | `tdd/program` |
| Latest | Wave 0 + File New / Add recording / Import-replaces / Locate error / parse drops zero-width marks |
| Wave 0 | **done** |
| Frontier | Wave 1 |

## Next (Wave 1)

| Ticket | Mutex | Blocked by |
|--------|-------|------------|
| project-session 01 | PAGE | none |
| transcript-session 01 | EDITOR | none |
| playback 02 | PLAYER | playback 01 **done** |
| waveform 01 | WAVEFORM | none |
| whisper 01 | RUST_WHISPER | whisper 02 **done** |

`vad-options 01` after transcript-session 01 (`EDITOR`). Then Wave 2 in `DELIVERY.md`.

## Product facts the next slice must keep

- File → **New** clears the session (confirm if dirty).
- File → **Import** replaces the session (1–2 recordings).
- File → **Add recording** attaches lane 2.
- File → **Open** is current-format `.hre.json`; Locate on missing sources; cancel leaves the current project and shows an error.
- Zero-width marks in JSON are dropped on parse.
- Out of scope for this version: alignment, speaker ID, mic-bleed removal.

## Pointers

- Orchestrator / mutex / later waves: `.scratch/DELIVERY.md`
- One-ticket TDD: `.scratch/WORKER.md`
- First red: `.scratch/<area>/TDD.md`
- Tickets: `.scratch/<area>/issues/`
