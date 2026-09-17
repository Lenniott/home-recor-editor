# TDD briefs — export-session

**Worker:** `.scratch/WORKER.md`

Seam: **runExport** (mode + writes via `writeWav` / `writeText` adapters). Page only picks destination and passes flags.

---

## 01

**Mutex:** EXPORT  
**Seam:** `runExport` in `src/lib/exportSession.ts` and names in `src/lib/exportNames.ts`. Combined-output label in `src/lib/components/FileMenu.svelte`.

**First red:** `it("merge writes stem-merge.wav")`  
Known: two tracks, directory `/out`, stem `interview`; `writeWav` paths `["/out/interview-merge.wav"]`. Mode name is `merge` (not `mix`).

**Prove red:** `npm test -- src/lib/exportSession.test.ts`

**Next reds:** `both` still writes separates + merge file; stereo default duplicates mono to L and R on a one-channel source; `channels: "mono"` writes one channel; existing sample-rate refuse still holds; File menu says Merge not Mix; README mix → merge.

**Out of scope:** clips, transcript txt, export marks.

---

## 02

**Mutex:** EXPORT  
**Seam:** `runExport({ scope: "clips", marks, ... })` (names as implemented; tests pass clip ranges + lane sets).

**First red:** `it("clips merge of a two-lane mark writes one clip wav")`  
Known: two tracks Alex/Sam; one mark `0`–`0.002` (or 4 frames at 16 kHz—use **frame-literal** times that match the test buffers); mode merge; expect one path `/out/interview-clip-1.wav`; `writeWav` called once.

**Prove red:** `npm test -- src/lib/exportSession.test.ts`

**Next reds:** one-lane mark writes one file even in separate; two-lane separate writes two speaker-suffixed clip names; both writes merge + separates for that mark; zero marks → error, `writeWav` 0; overlapping cuts that empty a mark skip that clip and still write others; existing path → error, no overwrite; silences inside the range are muted in the written PCM (literal samples).

**Out of scope:** dialog disable, transcript txt.

---

## 03

**Mutex:** EXPORT  
**Seam:** File menu / export dialog component: flags it passes to the page handler.

**First red:** `it("clips control is disabled when exportMarkCount is 0")`  
Known: render FileMenu (or export dialog child) with `exportMarkCount={0}`; clips control `disabled`; choosing clips is impossible (no handler fire).

**Prove red:** `npm test -- src/lib/components/FileMenu.test.ts` (create this file if missing; do not start with Playwright).

**Next reds:** clips enabled when count ≥ 1; all vs clips, merge/separate/both, mono/stereo are the flags `onExport` receives; Audio checkbox can be on with Transcript off (Transcript wiring may be disabled until 04—if the control is absent, skip and do it in 04).

**Out of scope:** actual disk, Playwright native sheets.

---

## 04

**Mutex:** EXPORT  
**Seam:** `runExport` writeText adapter + dialog checkboxes.

**First red:** `it("transcript-only writes stem-transcript.txt and no wav")`  
Known: complete words `[{ text: "Hello", start: 1, end: 1.5 }]` speaker `Alex`; apply edits on; no cuts; `writeText` `/out/interview-transcript.txt` contains `Hello` and a `0:00:01` (or `0:01`) clock; `writeWav` 0.

**Prove red:** `npm test -- src/lib/exportSession.test.ts`

**Next reds:** apply edits off keeps a word whose span is fully cut; apply edits on drops that word and remaps a later word’s clock by the cut length; clips scope keeps only words overlapping an export mark; existing txt path errors; File → Export transcript opens the same dialog with Audio off; README.

**Out of scope:** find bar, marker module changes.
