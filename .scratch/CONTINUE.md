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
| Latest | markers 01: unified silence/cut list; v3 save; two-lane silence is one mark |
| Frontier | markers 02, export-session 01, transcript-search 01 |

## Next

- `.scratch/markers/issues/02-type-change-drop-convert-all.md` — mutex MARKERS
- `.scratch/export-session/issues/01-merge-and-stereo-layout.md` — mutex EXPORT
- `.scratch/transcript-search/issues/01-find-phrase.md` — mutex TRANSCRIPT

## Where to look

Do not scan the repo first. Ticket → `.scratch/WORKER.md` → that area’s `TDD.md` `## NN` → locked decisions in `.scratch/DELIVERY.md`.

**Landed (markers 01, verified in the Tauri app):** `src/lib/markers.ts` is the list (`add` / `resize` / `subtract` / `replace` / `all`). No `setType` yet. `EditorState.markerList` is source of truth; `projectMarks()` writes per-lane `rawMarkers` and `cuts`. `src/lib/projectV2.ts` opens v2 as one-lane silences + all-lane cuts and saves v3 `markers`. Tests: `src/lib/markers.test.ts`, Mark/undo/save in `src/lib/editor.svelte.test.ts`.

**Next code (not a tour):**
- MARKERS 02: `MarkerList` + `convertAllSilencesToCuts` in `src/lib/editor.svelte.ts`; button in `src/routes/+page.svelte`; e2e name in `e2e/editor.spec.ts`; README convert-all bullet
- EXPORT 01: `src/lib/exportSession.ts`, `src/lib/audio/exportMix.ts`, `src/lib/exportNames.ts`, `src/lib/components/FileMenu.svelte`
- TRANSCRIPT 01: `src/lib/components/TranscriptPanel.svelte`, `src/lib/transcript.ts` — skip if a MARKERS worker has those tests

## Pointers

- Orchestrator / mutex: `.scratch/DELIVERY.md`
- One-ticket TDD: `.scratch/WORKER.md`
- First red: `.scratch/<area>/TDD.md`
- Tickets: `.scratch/<area>/issues/`
- Deferred: `.scratch/later.md`
