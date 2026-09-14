# TDD briefs — export-session

**Worker:** `.scratch/WORKER.md`

Seam: **export render** (Float32 arrays in/out) then **export session** (mode + write adapter). Tests use literals, not “same as renderEdited internals”.

---

## 01

**Branch:** `tdd/export-session/01-edited-render-matches-preview`  
**Mutex:** AUDIO_MATH  
**Seam:** `renderEdited` and `buildPlaybackPlan` as today; compare samples to a **frozen fixture array** or OfflineAudio in Vitest (jsdom/node as the repo already allows), not Playwright.

**First red:** `it("silences then cuts the same samples the playback plan would duck and skip")`  
Known source: `0.8` for 2s at 16 kHz; mute `[0.4, 0.9]`; cut `[0.8, 1.1]`; expect max abs diff vs OfflineAudio preview `< 1e-5` (move the existing e2e body here).

**Prove red:** `npm test -- src/lib/audio/applyEdits.test.ts` — fail because `renderEdited` cases are absent (add the test first; it may pass if function already matches — if it **passes immediately**, it is a characterization test: keep it, note “already green”, add the empty-export case as the true red).

**If first test is already green:** next cycle **must** be a new red: `it("throws or returns empty when cuts cover the whole duration")` against current user-visible empty-export.

**Out of scope:** dialogs, mix stereo, page progress.

---

## 02

**Branch:** `tdd/export-session/02-combined-mix-matches-preview`  
**Mutex:** AUDIO_MATH  
**Seam:** `combineRenders` after `renderForExport`.

**First red:** `it("mixes two full-scale mono tracks to stereo clamped at 1")`  
Expect: left and right `1` (or `-1`) not `1.5`.

**Prove red:** `npm test -- src/lib/audio/exportMix.test.ts`

**Next reds:** mono centred (L=R); unequal length pads tail zeros.

**Out of scope:** page.

---

## 03

**Branch:** `tdd/export-session/03-export-session-owns-staging`  
**Mutex:** PAGE  
**Seam:** `runExport({ mode, tracks, cuts, pickDestination, writeWav, onProgress })`.

**First red:** `it("separate mode writes one wav per track with speaker-suffixed names")`  
Expect: `writeWav` called twice with names matching existing naming rules (`stem-Alex-edited.wav` literals).

**Prove red:** `npm test -- src/lib/exportSession.test.ts`

**Next reds:** mix writes `stem-mix.wav`; both writes three files; page handlers only pick folder and call `runExport`.

**Out of scope:** Unicode IPC (04), sample rate (05).

---

## 04

**Branch:** `tdd/export-session/04-unicode-and-long-name-export-writes`  
**Mutex:** RUST_IO  
**Seam:** `write_audio_file` path header percent-decode.

**First red:** `#[test] fn percent_decode_round_trips_non_ascii_path`  
Expect: decoded path equals original Unicode string already used in lib tests style.

**Prove red:** `cargo test --manifest-path src-tauri/Cargo.toml percent_decode`

**Next reds:** invalid `%` returns error; JS `writeWav` uses encodeURIComponent (characterization).

**Out of scope:** resampling.

---

## 05

**Branch:** `tdd/export-session/05-mismatched-sample-rate-export`  
**Mutex:** PAGE  
**Decision:** refuse; do not resample.

**First red:** `it("runExport fails before write when track sample rates differ")`  
Expect: error mentions convert and reopen; `writeWav` call count 0.

**Prove red:** `npm test -- src/lib/exportSession.test.ts`
