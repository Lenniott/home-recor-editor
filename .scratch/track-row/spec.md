# Track row owns settings; ruler selects across tracks

## Why

The page currently owns a whole-column compact/full toggle, a header detection panel bound to the focused track, and a Focus button. The work happens on the waveform. Each row should own its own settings board. Manual selection across tracks belongs on the shared ruler, not on a focused row.

Joint detect / apply / export-mix stay in the header. They are session work.

## Locked decisions

- Compact is the working state: 240px chrome + waveform. Full is a settings board at 100% width with the waveform unmounted (the board is wide, not because the track became "focused").
- Each row owns compact/full. No page-level column toggle.
- Detection settings (VAD/quiet sliders, detect, view filter, mute marked) live in the expanded row. Header "Detection settings" goes away.
- Apply silence/remove exists in one place, not both header chrome and the row.
- No Focus button. Pointer-down on a lane is last-clicked for keyboard (`[`, `]`, `m` on a per-track selection, undo, Cmd+S).
- Every compact row is a working waveform. Lane marquee still selects that track only.
- Ruler drag sets a pending selection in session time. `m` writes it onto every track via each track's `offsetSec`. Header apply silence/remove on that selection bakes every loaded track.
- Joint regions stay a separate list (detected "nobody speaking").

## Out of scope

- **HostFs / persist port.** Save and export already live on the page as Tauri dialogs + `invoke`. A filesystem port would exist so tests can fake disk without Tauri. Not needed to move settings onto the row.
- **Lane click → `session.seek`.** A click on one waveform currently seeks that track's player only. The other playheads stay put, so Play can start them from different times. `session.seek` already moves every track together. Wiring lane clicks to it is a playback-sync fix, not this layout/selection work.

## Tickets

See `issues/`. Frontier: 01 and 03 can start in parallel. 02 waits on 01. 04 waits on 03.

Work the frontier with `/implement`. Do not start until the current `daul-track-ops` dirty worktree is committed (see commit-curator plan in the conversation that wrote this spec).
