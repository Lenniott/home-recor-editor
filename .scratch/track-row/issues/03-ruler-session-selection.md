# 03 — Ruler drag selects in session time and marks every track

**What to build:** Drag on the ruler sets a pending selection in shared session time. Every waveform shows that span. `m` writes it onto every loaded track, translated through each track's `offsetSec` (regions that fall off a track are dropped). Escape clears the session selection. A drag-select on a single lane still selects that track only and does not become the session selection. Joint regions stay a separate list from this pending selection.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Drag on the ruler creates a pending session-time selection, visible on the ruler and on every compact waveform.
- [ ] `m` with a session selection marks every track via `offsetSec`; a one-track session still works.
- [ ] Escape clears the session selection without touching existing markers.
- [ ] A lane marquee still selects that track only; `m` then marks that track only.
- [ ] If both a session selection and a per-track selection exist, session selection wins for `m`.
- [ ] Unit tests cover translating a session span onto tracks with different offsets (clip and drop out-of-range).
- [ ] Joint regions are unchanged by this selection.
