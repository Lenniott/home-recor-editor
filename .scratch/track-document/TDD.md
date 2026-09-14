# TDD briefs — track-document

**Worker:** `.scratch/WORKER.md`

Seam: **toProjectV2 / applyProjectV2** (existing). Tests use literal mark times.

---

## 01

**Branch:** `tdd/track-document/01-reload-does-not-shrink-buffered-marks`  
**Mutex:** EDITOR  

**First red:** `it("save then applyProjectV2 keeps rawMarkers when bufferMs is 150")`  
Marks `[1, 2]` literal; after round-trip `rawMarkers` still `[1, 2]` not `[1.15, 1.85]`.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

---

## 02

**Branch:** `tdd/track-document/02-cut-suggestions-match-live-marks`  
**Mutex:** EDITOR  

**First red:** `it("cutSuggestionList equals cutSuggestions of each track's silence document")`  
Two tracks overlap `1–3` and `2–4` → suggestion `{start:2,end:3}` (hand-checked).

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

---

## 03

**Branch:** `tdd/track-document/03-apply-project-never-wrong-lane`  
**Mutex:** EDITOR  
**Decision:** extra saved tracks ignored.

**First red:** `it("applyProjectV2 with two saved tracks and one loaded lane does not copy the second track's marks onto the first")`  
Expect: first lane marks unchanged from loaded audio; second document unused.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

---

## 04

**Branch:** `tdd/track-document/04-legacy-first-save-preserves-marks`  
**Mutex:** EDITOR  

**First red:** `it("legacy apply then toProjectV2 writes those marks as manualSilences")`  
Expect: `manualSilences: [{start:1,end:2}]`, version 2.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`
