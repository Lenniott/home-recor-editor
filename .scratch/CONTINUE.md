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

## Status (2026-09-15)

| Item | State |
|------|--------|
| Branch | `tdd/program` |
| Latest | transcript-session 01: `EditorState.applyTranscript(trackId, words, status)` is the only write path from the transcript pane. Writes the job owner, not the active lane; identical words+status do not bump `revision`; panel `onSettled` calls the method; stale results after `loadAudio` still discarded. `setTranscript` delegates. Queue failure policy is ticket 03. |
| Wave 0 | **done** |
| Wave 1 | in progress (PAGE free, EDITOR free) |
| Frontier | Wave 1 remainder |

## Next (Wave 1)

| Ticket | Mutex | Blocked by |
|--------|-------|------------|
| vad-options 01 | EDITOR | transcript-session 01 **done** |
| playback 02 | PLAYER | playback 01 **done** |
| waveform 01 | WAVEFORM | none |
| whisper 01 | RUST_WHISPER | whisper 02 **done** |

Wave 2 (`project-session` 03–05, PAGE, base = 01) in `DELIVERY.md`.

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
