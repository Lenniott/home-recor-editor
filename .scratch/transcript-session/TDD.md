# TDD briefs — transcript-session

**Worker:** `.scratch/WORKER.md`

Seam: **EditorState.applyTranscript(trackId, words, status)** (name may match existing `setTranscript` if generalized). Panel `onSettled` only calls that.

---

## 01

**Branch:** `tdd/transcript-session/01-single-write-path-for-transcripts`  
**Mutex:** EDITOR  

**First red:** `it("applyTranscript writes words to the given track when another lane is active")`  
Expect: track B words `[{text:"Hi",start:0,end:0.2}]`; active remains A; `dirty` true.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

**Next reds:** identical words+status do not bump revision; panel onSettled uses the method (component test).

**Out of scope:** queue failure policy (03).

---

## 02

**Branch:** `tdd/transcript-session/02-restore-transcript-into-job-runner`  
**Mutex:** EDITOR  

**First red:** `it("after applyProjectV2 the transcript pane does not show transcribe-empty copy when words exist")`  
Mount panel; expect empty-state absent. Spy `restore` called once.

**Prove red:** `npm test -- src/lib/components/TranscriptPanel.test.ts`

---

## 03

**Branch:** `tdd/transcript-session/03-fail-one-track-continue-queue`  
**Mutex:** EDITOR  

**First red:** `it("a failed middle track still transcribes the following track")`  
Expect: track C `complete` with fixture words; B `missing` or error.

**Prove red:** `npm test -- src/lib/components/TranscriptPanel.test.ts`

---

## 04

**Branch:** `tdd/transcript-session/04-transcript-dirty-matches-undo`  
**Mutex:** EDITOR  
**Decision:** dirty yes, undo no.

**First red:** `it("completing a transcript marks dirty and undo does not remove the words")`  
Expect: after undo, words still `Hi`; `dirty` still true until save.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts`

---

## 05

**Branch:** `tdd/transcript-session/05-skip-complete-tracks-on-transcribe-all`  
**Mutex:** EDITOR  

**First red:** `it("transcribe all skips tracks already complete")`  
Expect: `transcribe` spy once for the missing track only.

**Prove red:** `npm test -- src/lib/components/TranscriptPanel.test.ts`
