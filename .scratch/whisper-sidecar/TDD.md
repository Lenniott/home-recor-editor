# TDD briefs — whisper-sidecar

**Worker:** `.scratch/WORKER.md`

Seam: native commands + `transcription-progress` phases; TS `Transcription` event handler.

---

## 01

**Branch:** `tdd/whisper-sidecar/01-progress-phase-contract`  
**Mutex:** RUST_WHISPER  

**First red:** `it("ignores a progress event with an unknown phase and the same job id")`  
Expect: words unchanged; no throw.

**Prove red:** `npm test -- src/lib/transcription.test.ts`

**Next reds:** rust emits `transcribing-cpu` on GPU retry (existing helper if any).

---

## 02

**Branch:** `tdd/whisper-sidecar/02-invalid-wav-does-not-reserve-job`  
**Mutex:** RUST_WHISPER  

**First red:** `#[test] fn start_transcription_rejects_body_without_riff`  
Expect: error; a following valid start is allowed (job not stuck).

**Prove red:** `cargo test --manifest-path src-tauri/Cargo.toml start_transcription_rejects`

---

## 03

**Branch:** `tdd/whisper-sidecar/03-golden-whisper-json-to-words`  
**Mutex:** RUST_WHISPER  
**Optional.** Needs a fixture file checked in.

**First red:** `it("parseTranscript maps fixture offsets 0 and 200 ms to 0 and 0.2 seconds")`  
Literals from the fixture.

**Prove red:** `npm test -- src/lib/transcript.test.ts`

---

## 04

**Branch:** `tdd/whisper-sidecar/04-optional-sidecar-smoke`  
**Optional / CI skip by default.**

**First red:** documented script `npm run test:whisper-smoke` skipped unless `WHISPER_SMOKE=1`. Do not fail default `npm test`.
