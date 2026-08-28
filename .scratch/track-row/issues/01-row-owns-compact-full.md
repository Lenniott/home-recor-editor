# 01 — Track row owns compact/full

**What to build:** Each track row controls its own compact vs full layout. Compact is the working state: a 240px chrome strip beside the waveform. Full expands that chrome to 100% width and unmounts the waveform (the settings board is wide). Expanding one row leaves the others compact with their waveforms visible. The toolbar "Track settings" toggle is gone. The Focus button is gone; pointer-down on a lane sets last-clicked for keyboard shortcuts (`[`, `]`, undo, Cmd+S, and `m` when that track has a local selection). Joint detect / apply / export-mix stay in the header.

**Blocked by:** None — can start immediately.

**Status:** claimed

- [ ] Each row has its own compact/full; there is no whole-column mode.
- [ ] Compact: 240px chrome + waveform. Full: 100% chrome, waveform unmounted (not hidden with CSS).
- [ ] Expanding one row does not expand the others.
- [ ] The shared ruler still lines up with remaining compact waveforms (240px gutter).
- [ ] Toolbar has no "Track settings" / "Collapse track settings" control.
- [ ] No Focus button. Pointer-down on a lane is last-clicked for `[` / `]` / undo / Cmd+S.
- [ ] Joint header actions still work.
