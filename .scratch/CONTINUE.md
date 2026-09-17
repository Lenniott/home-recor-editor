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
| Branch | `tdd/program` |
| Latest | markers 02 type-change; export-session 01 merge+stereo; transcript find (literal phrase, case-insensitive, multi-word) |
| Frontier | markers 03 |

## Next

- `.scratch/markers/issues/03-select-list-remove.md` — mutex MARKERS — **Blocked by 02: done**

Do not start export-session 02: it is blocked by markers 04. Transcript-search has no further tickets.

## Where to look

Do not scan the repo first.

1. `.scratch/markers/issues/03-select-list-remove.md`
2. `.scratch/WORKER.md`
3. `.scratch/markers/TDD.md` `## 03`
4. Locked **Select** bullet in `.scratch/DELIVERY.md`

**First red (name must match):** `it("removing the selected marks is one undo step")`  
Known: two silence marks; select both ids; remove; `all()` `[]`; undo restores both ids.  
**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

**Code to open (not a tour):**
- `src/lib/editor.svelte.ts` — `markerList` is source of truth; `setType(id, type)` exists; **no selected-mark ids yet**
- `src/lib/markers.ts` — `add` / `resize` / `subtract` / `replace` / `setType` / `all`; **no select API**
- `src/routes/+page.svelte` Edits pane — type change is **one row at a time** (`Change to cut` / `Change to silence`); 03 must make type change apply to a multi-selection
- Tests: `src/lib/editor.svelte.test.ts`, `src/lib/markers.test.ts`

**Leave alone:** `TranscriptPanel` find (`transcriptFindHits` in `src/lib/transcript.ts`); export `merge` / stereo in `exportSession.ts` / `FileMenu.svelte`; export mark **type** (04).

**After 03:** `.scratch/markers/issues/04-export-mark-type.md` (Mark action `export`; overlapping export marks stay two records). Then `.scratch/export-session/issues/02-clips-scope.md`.

## Pointers

- Orchestrator / mutex: `.scratch/DELIVERY.md`
- One-ticket TDD: `.scratch/WORKER.md`
- First red: `.scratch/<area>/TDD.md`
- Tickets: `.scratch/<area>/issues/`
- Deferred: `.scratch/later.md`
