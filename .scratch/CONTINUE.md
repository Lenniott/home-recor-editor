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

## Status (2026-09-17)

| Item | State |
|------|--------|
| Branch | `tdd/program` (uncommitted; do not commit unless asked) |
| Latest | Remaining Wave 2–4 leftovers closed: playback 03–05, transcript 02, vad 03, e2e 01–06, waveform 05, whisper 03. Whisper 04 skip-script landed; live sidecar smoke is optional/external. |
| Wave 0 | **done** |
| Wave 1 | **done** |
| Wave 2 | **done** |
| Wave 3 | **done** |
| Wave 4 | **done** (whisper 04 optional smoke needs `WHISPER_SMOKE=1` + engine binary) |
| Frontier | none — Next is empty |

Verified this session: `npm test` (350), `npm run check` (0 errors), `cargo test --manifest-path src-tauri/Cargo.toml` (14), `npm run test:e2e` (10 passed, Chromium). `npm run test:whisper-smoke` skips unless `WHISPER_SMOKE=1`.

## Next

_(empty)_

Blockers: whisper 04 live smoke only — needs the sidecar under `src-tauri/binaries` and `WHISPER_SMOKE=1`. Not required for default `npm test`.

## Product facts the next slice must keep

- File → **New** clears the session (confirm if dirty).
- File → **Import** adds to the current session (max two recordings). Importing a recording that is already a lane is refused. First import into an empty session may restore a current-format companion; missing companion is a blank session; unreadable companion shows an error and blocks Save to that path (Save As still works). First Save will not overwrite an existing `.hre.json` beside the recording unless this session is already bound to it. File → **New** starts over.
- File → **Add recording** attaches lane 2.
- File → **Open** is current-format `.hre.json`; Locate on missing sources; cancel leaves the current project and shows an error.
- Zero-width marks in JSON are dropped on parse.
- Out of scope for this version: alignment, speaker ID, mic-bleed removal.

## Pointers

- Orchestrator / mutex / later waves: `.scratch/DELIVERY.md`
- One-ticket TDD: `.scratch/WORKER.md`
- First red: `.scratch/<area>/TDD.md`
- Tickets: `.scratch/<area>/issues/`
