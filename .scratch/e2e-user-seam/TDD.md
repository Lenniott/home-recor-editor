# TDD briefs — e2e-user-seam

**Worker:** `.scratch/WORKER.md`

Seam: **user chrome + fake desktop adapter**. After 02, specs do not `import()` the session module.

---

## 01

**Branch:** `tdd/e2e-user-seam/01-playwright-fake-desktop-adapter`  
**Mutex:** PAGE  
**Seam:** same desktop adapter as project-session 01, installed for Chromium via init script or test hook.

**First red:** `test('import recordings uses registered virtual wav')` in Playwright  
Expect: after clicking Import (or the test hook that resolves the dialog to the virtual path), `[data-track-lane]` count 1. No `editor.svelte` in the spec file.

**Prove red:** `npm run test:e2e -- e2e/editor.spec.ts -g "virtual wav"`

**Out of scope:** rewriting all eight tests (that is 02).

---

## 02

**Branch:** `tdd/e2e-user-seam/02-e2e-bootstrap-via-import`  
**Mutex:** E2E  
**Seam:** shared `seed(page)` helper using adapter + Import.

**First red:** replace current seed; `test('one-lane selection...')` still enables Mark M  
Expect: spec file has zero `editor.svelte` substrings.

**Prove red:** `npm run test:e2e`

**Out of scope:** changing oracles to chrome (03).

---

## 03

**Branch:** `tdd/e2e-user-seam/03-e2e-oracles-are-visible-chrome`  
**Mutex:** E2E  
**Seam:** DOM / roles only.

**First red:** convert `displayKeptDuration` assertion in the selection test to Preview edits changing the on-screen edited-time readout (use the label the Transport already shows).

**Prove red:** `npm run test:e2e -- -g "pending cuts"`

**Out of scope:** new features.

---

## 04

**Branch:** `tdd/e2e-user-seam/04-demote-audio-and-vad-from-playwright`  
**Mutex:** E2E + AUDIO_MATH (serialize after export-session 01)  
**Blocked extra:** export-session 01 done.

**First red:** delete or skip the Playwright export-parity test; confirm `applyEdits.test.ts` still has the `< 1e-5` case. If missing, that is export 01’s job — stop.

**Prove red:** `npm run test:e2e` (faster, one fewer test) and `npm test`.

**Next reds:** VAD fixture test lives next to `vadDetector` tests; README Verification bullets updated.

---

## 05

**Branch:** `tdd/e2e-user-seam/05-open-edit-save-roundtrip-e2e`  
**Mutex:** E2E  

**First red:** `test('save then open restores a silence mark in the timeline')`  
Expect: `.mark` visible after Open; virtual JSON contains the range `1`–`2` (literals from the Mark action).

**Prove red:** `npm run test:e2e -- -g "save then open"`

---

## 06

**Branch:** `tdd/e2e-user-seam/06-export-dialog-e2e`  
**Mutex:** E2E  

**First red:** `test('export mix writes a stereo wav to the virtual folder')`  
Expect: virtual file exists; channel count 2; no `renderEdited` in spec.
