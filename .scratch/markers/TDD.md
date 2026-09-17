# TDD briefs — markers

**Worker:** `.scratch/WORKER.md`

Seam: **marker list** (add / resize / remove / setType / setLanes / all) then **editor** (Mark uses the list). Tests use known times and lane ids as literals.

---

## 01

**Mutex:** MARKERS  
**Seam:** marker list module (new) plus editor Mark/Unmark/cut that call it. Persist via parse/serialize of the project file.

**First red:** `it("cross-lane silence add is one mark with both lane ids")`  
Known: lanes `"a"`, `"b"`; add silence `1`–`2` on both; `all()` length `1`; `laneIds` `["a","b"]`; `start` `1`; `end` `2`.

**Prove red:** `npm test -- src/lib/markers.test.ts`

**Next reds (one per cycle):** resize start of that mark to `0.5` still length 1; two one-lane silences at the same times stay two marks; same-lane overlapping silences merge to one interval; cut add with one lane still stores **all** track ids; v2 JSON with per-track `manualSilences` plus `cuts` opens as one-lane silences + all-lane cuts (no silent drop); save/reload keeps a two-lane silence as one mark; editor Mark on both selected lanes creates one id (existing two-lane selection gesture); undo restores the previous list; cut suggestions still match displayed silences.

**Out of scope:** export type, marker list UI, Cmd+A, type change, convert-all removal, File → Export, find.

---

## 02

**Mutex:** MARKERS  
**Seam:** `setType` on `src/lib/markers.ts`; editor/UI that used convert-all (`EditorState.convertAllSilencesToCuts`, button in `src/routes/+page.svelte`).

**First red:** `it("setType silence to cut expands laneIds to every track")`  
Known: tracks `"a"`, `"b"`; silence on `"a"` only `1`–`2`; `setType` → `cut`; `laneIds` `["a","b"]`; type `"cut"`; still one mark.

**Prove red:** `npm test -- src/lib/markers.test.ts`

**Next reds:** cut → silence keeps all lanes (synced silence); two silences that become cuts merge if they overlap; convert-all control gone; README no longer documents convert-all; type change is one undo step.

**Out of scope:** export type, multi-select UI.

---

## 03

**Mutex:** MARKERS  
**Seam:** editor selected-mark ids; marker list panel; keyboard.

**First red:** `it("removing the selected marks is one undo step")`  
Known: two silence marks; select both ids; remove; `all()` `[]`; undo restores both ids.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

**Next reds:** Cmd/Ctrl+A with a lane focused selects every mark; list shows all current marks; Backspace with a mark selected deletes (component or editor test, not Playwright unless e2e already covers keys).

**Out of scope:** filter/hidden, export type.

---

## 04

**Mutex:** MARKERS  
**Seam:** marker list catalog + editor Mark when action is export; waveform/cut-lane paint order only as needed for tests that query marks, not pixel tests.

**First red:** `it("two overlapping export marks both remain")`  
Known: export `1`–`3` and `2`–`4` on lane `"a"`; `all()` length `2`.

**Prove red:** `npm test -- src/lib/markers.test.ts`

**Next reds:** export may be one lane or both (synced); Mark in export action uses selected lanes like silence; save/reload export marks; silence+cut+export at the same time all exist in data; z-order documented in README (silence under cut under export).

**Out of scope:** writing WAV/TXT, export dialog, find.
