# Baseline replacements

Swap chrome `<button>` / overlay UI onto `Button.svelte` and `Model.svelte`. Leave timeline hit-targets and native OS dialogs alone.

## Button

Props: `variant` primary | secondary | tertiary · `toggle` · `icon` none | left | right · `label` · `tooltip` · snippet `glyph`.

| File | Control | Replace with |
| --- | --- | --- |
| `src/lib/components/Transport.svelte` | Play / Pause | `variant="primary"` |
| `src/lib/components/Transport.svelte` | Preview edits | `variant="tertiary"` `toggle` `bind:pressed` `tooltip` (keep the switch in `glyph` or as children) |
| `src/lib/components/SilenceControls.svelte` | Run VAD / silence floor | `variant="primary"` |
| `src/lib/components/SilenceControls.svelte` | Prev / next marked region | `variant="secondary"` `icon="left"` `label={false}` `tooltip` + `glyph` (`IconCaret`) · `aria-label` required |
| `src/lib/components/SelectionActions.svelte` | Mark | `variant="primary"` |
| `src/lib/components/SelectionActions.svelte` | Unmark | `variant="secondary"` |
| `src/lib/components/SelectionActions.svelte` | Clear (IconClose) | `icon="left"` `label={false}` `tooltip` + `glyph` |
| `src/lib/components/CutLane.svelte` | Prev / next suggestion | icon-only secondary + `glyph` (`IconCaret`) |
| `src/lib/components/CutLane.svelte` | Audition, Mark all suggestions | `variant="secondary"` |
| `src/lib/components/CutLane.svelte` | Mark cut | `variant="primary"` |
| `src/lib/components/CutLane.svelte` | Dismiss | `variant="secondary"` (destructive color stays local until Button grows a tone) |
| `src/lib/components/TrackLane.svelte` | Edit / Editing | `variant="secondary"` `toggle` `icon="left"` `glyph` (`IconRadio`) `tooltip` |
| `src/lib/components/TrackLane.svelte` | Remove | `variant="secondary"` `tooltip` |
| `src/lib/components/FileMenu.svelte` | File | `variant="secondary"` `toggle` `bind:pressed={menuOpen}` |
| `src/lib/components/FileMenu.svelte` | Export choices (Separate / Mix / Both / Export edited) | `variant="primary"` |
| `src/lib/components/FileMenu.svelte` | Cancel / Done / Close | `variant="secondary"` |
| `src/lib/components/TranscriptPanel.svelte` | Transcribe all, Download model | `variant="primary"` |
| `src/lib/components/TranscriptPanel.svelte` | Retry, Download again, Cancel, Mark/Unmark/Clear | `variant="secondary"` |
| `src/routes/+page.svelte` | pane tabs | `variant="secondary"` `toggle` `pressed={tab === name}` |
| `src/routes/+page.svelte` | Convert all silences to shared cuts | `variant="primary"` |
| `src/routes/+page.svelte` | cut/silence time + Unmark rows | `variant="secondary"` |
| `src/routes/+page.svelte` | Panels | `variant="secondary"` `icon="left"` `glyph` (`IconChevron`) `toggle` `bind:pressed={paneOpen}` `tooltip` |
| `src/routes/+page.svelte` | Fit recording | `variant="secondary"` |
| `src/routes/+page.svelte` | Undo / Redo | `icon="left"` `label={false}` `tooltip` + `glyph` |

### Do not replace

| File | Control | Why |
| --- | --- | --- |
| `src/lib/components/TimelineRuler.svelte` | `.ruler` | Seek surface, not chrome |
| `src/lib/components/CutLane.svelte` | `.mark.cut` / `.mark.suggestion` | Lane hit-targets |
| `src/lib/components/FileMenu.svelte` | `role="menuitem"` rows | Menu items, not buttons in the toolbar sense |

## Model (modal / drawer)

Props: `placement` center \| left \| right \| top \| bottom · `bind:open` · `closable` · `labelledby`.

| File | Overlay | Replace with |
| --- | --- | --- |
| `src/lib/components/FileMenu.svelte` | `<dialog class="modal">` export sheet | `<Model placement="center" bind:open labelledby="export-title" closable={!isExporting}>` |
| `src/routes/+page.svelte` | `aside` as a full-height overlay under `max-width: 900px` | `<Model placement="left" bind:open={paneOpen}>` wrapping pane tabs + content (desktop can stay an in-flow aside) |
| `src/lib/components/TrackLane.svelte` | `confirm(...)` before remove | optional later: `placement="center"` confirm |

### Do not replace

Native Tauri `open` / `save` dialogs in `+page.svelte`. File-picker chrome is OS-owned.

## Existing visual variants → Button axes

These are the styles already in the app, mapped onto the new props:

- **primary** — Play; VAD run; Mark; Mark cut; Transcribe / download; Convert silences; export format choices. Matches amber fill used on active tabs / “Editing”.
- **secondary** — default `app.css` button (Fit, Unmark, Audition, Cancel, File, retry).
- **tertiary** — Transport “Preview edits” ghost.
- **toggle** — Preview edits, Edit/Editing, pane tabs, Panels, File menu.
- **icon left** — Panels, Edit+radio, Undo/Redo, caret prev, Clear.
- **icon right** — unused today; keep the prop for symmetry.
- **label false** — Undo, Redo, Clear, caret steppers.
- **tooltip true** — anything that already sets `title=` (Preview, Convert silences, Remove, marker nav, track activate).
