# TDD briefs — playback

**Worker:** `.scratch/WORKER.md`

Seam: **AudioPlayer** constructed with a session. Fake `AudioContext` records `start`/`stop`/`linearRampToValueAtTime`.

---

## 01

**Branch:** `tdd/playback/01-remove-unused-single-track-player`  
**Mutex:** FREE  
**Seam:** none (delete).  

**First red:** not a test — `rg player.svelte` must be empty after delete. Prove by `npm run check` green.

**If you need a test:** `it("player module exports AudioPlayer bound to multi-track plan")` already exists indirectly; skip new tests.

**Out of scope:** changing `player.ts`.

---

## 02

**Branch:** `tdd/playback/02-injectable-playback-session`  
**Mutex:** PLAYER  

**First red:** `it("constructs AudioPlayer with a given EditorState instead of the module singleton")`  
Expect: `new AudioPlayer(freshEditor)` does not read the global editor’s playhead.

**Prove red:** `npm test -- src/lib/player.test.ts`

**Out of scope:** fake context scheduling (03). App may keep `export const player` as a convenience **after** construction — do not add a second player class.

---

## 03

**Branch:** `tdd/playback/03-play-pause-seek-fake-audio-context`  
**Mutex:** PLAYER  

**First red:** `it("play starts one buffer source per plan chunk for a single track")`  
Expect: `start` call count equals chunk count from `buildPlaybackPlan` on the same spans; first `when` is a literal `0` (or documented contextStart).

**Prove red:** `npm test -- src/lib/player.test.ts`

**Next reds:** pause maps playhead to source time 1.5s literal mid-chunk; seek while playing stops then starts again.

---

## 04

**Branch:** `tdd/playback/04-playhead-clock-and-end`  
**Mutex:** PLAYER  

**First red:** `it("playhead uses source time so a 0.5s cut does not advance displayed time across the hole")`  
Expect: after fake `currentTime` += 1 over a cut at 0.5–1.0, playhead is `1.0` source (literal from a 2s file with one cut).

**Prove red:** `npm test -- src/lib/player.test.ts`

---

## 05

**Branch:** `tdd/playback/05-refresh-playback-while-listening`  
**Mutex:** PLAYER  

**First red:** `it("refreshIfPlaying while paused does not call start")`  
Expect: start count unchanged.

**Prove red:** `npm test -- src/lib/player.test.ts`

**Next reds:** while playing, preview edited causes a new `stop` then `start`.
