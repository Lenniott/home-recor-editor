# TDD briefs — vad-options

**Worker:** `.scratch/WORKER.md`

Seam: **`sileroThresholds(positive)`** used by detection and transcribe.

---

## 01

**Branch:** `tdd/vad-options/01-shared-silero-threshold-helper`  
**Mutex:** EDITOR (two call sites) — Wave 1 only when EDITOR free  

**First red:** `it("sileroThresholds(0.5) is { positive: 0.5, negative: 0.35 }")`  
Literal 0.35.

**Prove red:** `npm test -- src/lib/audio/sileroThresholds.test.ts`

**Next reds:** `0.1` → negative `0`; editor detect and transcribe import the helper (grep).

---

## 02

**Branch:** `tdd/vad-options/02-transcribe-uses-track-silence-settings`  
**Mutex:** EDITOR  

**First red:** `it("transcribe passes the track positiveSpeechThreshold to vad detect")`  
Set setting `0.7`; expect detect options positive `0.7`, negative `0.55`.

**Prove red:** `npm test -- src/lib/transcription.test.ts`

---

## 03

**Branch:** `tdd/vad-options/03-detection-transcription-vad-parity`  
**Mutex:** EDITOR  

**First red:** `it("runSilenceDetection and transcribe pass the same vad options for one track")`  
Mock detect; deep-equal options.

**Prove red:** `npm test -- src/lib/editor.svelte.test.ts` and transcription test sharing a fixture helper.

---

## 04

**Branch:** `tdd/vad-options/04-align-vad-test-fixtures`  
**Mutex:** FREE after 01  

**First red:** replace literals in `vadDetector.test.ts` with `sileroThresholds(0.5)`. If tests stay green, done. No new behavior.
