# TDD briefs — transcript-search

**Worker:** `.scratch/WORKER.md`

Seam: **TranscriptPanel** (find field + highlights). Clicking a hit must reuse existing word select/seek.

---

## 01

**Mutex:** TRANSCRIPT  
**Seam:** `src/lib/components/TranscriptPanel.svelte` (and its `.test.ts`) with an editor that already has complete words.

**First red:** `it("highlights every case-insensitive phrase match")`  
Known: words `Hello` then `world` then `HELLO`; query `hello`; two highlights (or three if you count both Hellos—**expect 2** if the third is the same token twice: use words `[{text:"Hello",...},{text:"there",...},{text:"hello",...}]` and expect **2** `[data-find-hit]`).

**Prove red:** `npm test -- src/lib/components/TranscriptPanel.test.ts`

**Next reds:** next/prev moves `aria-current` among hits and wraps; empty query clears hits; no complete transcript → find control disabled; Cmd/Ctrl+F focuses the field (if jsdom cannot, document in ticket and cover focus via exported handler—prefer a real key test).

**Out of scope:** regex, replace, persist query, waveform second highlight, export txt.
