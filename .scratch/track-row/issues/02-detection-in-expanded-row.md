# 02 — Detection settings live in the expanded row

**What to build:** Expanding a row shows that track's detection and file settings: VAD/quiet sliders, detect silence, detect quiet, view filter, mute marked, sync offset, apply silence/remove, save, export, remove. The header "Detection settings" panel and its toggle are gone. Apply silence/remove exists in one place (the expanded row), not duplicated with leftover header chrome. The header is add / play / time / joint ops only.

**Blocked by:** 01 — Track row owns compact/full

**Status:** ready-for-agent

- [ ] Expanded row contains the detection sliders and detect actions that used to live in the header panel.
- [ ] Header has no "Detection settings" toggle and no focused-track detection panel.
- [ ] Apply silence / apply remove for a single track live only in the expanded row.
- [ ] Sync offset, save, export, and remove live in the expanded row.
- [ ] Joint detect / apply / export-mix remain in the header.
- [ ] Collapsing returns to the waveform working state.
