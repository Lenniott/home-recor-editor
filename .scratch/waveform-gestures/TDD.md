# TDD briefs — waveform-gestures

**Worker:** `.scratch/WORKER.md`

---

## 01

**Branch:** `tdd/waveform-gestures/01-cross-lane-selection-from-lane-bounds`  
**Mutex:** WAVEFORM  
**Seam:** pure `trackIdsForPointerY({ lanes, originId, clientY })`.

**First red:** `it("selects both lanes when the pointer Y sits in the second lane")`  
Lanes: `{id:"a",top:0,bottom:10}`, `{id:"b",top:10,bottom:20}`; origin `a`; y `15` → `["a","b"]`.

**Prove red:** `npm test -- src/lib/audio/lanePointer.test.ts`

**Next reds:** y outside → origin only; Waveform uses the helper (no `querySelectorAll` in pointermove).

---

## 02

**Branch:** `tdd/waveform-gestures/02-selection-drag-finish-policy`  
**Mutex:** EDITOR  
**Decision:** pending only; comments match.

**First red:** `it("finishSelectionDrag leaves overlapping selection unmarked")` already exists — if green, this ticket is **docs + delete AUTO_MERGE mention on finishSelectionDrag**. Prove: grep comments; no behavior change; `npm test`.

**Out of scope:** implementing auto-merge.

---

## 03

**Branch:** `tdd/waveform-gestures/03-shared-overlap-merge-helper`  
**Mutex:** EDITOR  

**First red:** `it("merges two raw markers when overlap exceeds 0.4 of the shorter")`  
Expect: one marker `{start:1,end:4}` from `[1,3]` and `[2.5,4]` (literals you compute by hand once).

**Prove red:** `npm test -- src/lib/audio/silence.test.ts` or editor tests — put the helper next to existing merge.

---

## 04

**Branch:** `tdd/waveform-gestures/04-lane-layout-gutter-mapping-tests`  
**Mutex:** FREE  
**Seam:** `laneLayout`.

**First red:** `it("xToKept at the left gutter edge maps to the first visible span start")`  
Use a 10s view, one hidden `[2,3]`, width `1000` — expected kept time is a **hand-worked literal**.

**Prove red:** `npm test -- src/lib/audio/laneLayout.test.ts`

---

## 05

**Branch:** `tdd/waveform-gestures/05-e2e-silence-marker-edge-merge`  
**Mutex:** E2E + WAVEFORM  

**First red:** `test('dragging a silence edge into a neighbor merges on pointer up')`  
Expect: one `.mark` not `.cut` after release; count stays 2 during move (sample mid-drag).

**Prove red:** `npm run test:e2e -- -g "silence edge"`
