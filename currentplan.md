# Two-track podcast cleanup editor

## Direction

Extend the existing editor into a project with two synced speaker tracks, individual silence edits, shared cuts, and a saved conversation transcript. Reuse the existing detection, waveform, timeline mapping, playback, and export logic.

Use established patterns: synchronized edits across tracks, as in [Audacity’s sync-locked groups](https://manual.audacityteam.org/man/sync_locked_track_groups.html), and a combined transcript backed by separate speaker recordings, as in [Descript sequences](https://help.descript.com/hc/en-us/articles/16049556759693-Syncing-audio-and-video-from-a-single-camera-shoot).

Assume one mostly isolated speaker per track. Alignment, effects, automatic speaker identification, and mic-bleed removal remain outside this version.

## Editing and playback

- Keep original audio intact. Store **silence ranges per track** and **cut ranges for the whole project**. Both are reversible through the existing undo/redo mechanism.
- Use one clock, ruler, zoom position, and cut map for both waveform lanes. A cut removes identical time from both; silencing never moves audio.
- Reuse speech detection, quiet detection, minimum-length settings, and edge buffers per track. Clearly indicate the selected track when adjusting settings.
- Detection produces editable track-silence regions. Suggest shared cuts only where both tracks’ detected silence overlaps, after applying speech-protection buffers and minimum-length rules.
- Review cut suggestions with previous/next, audition, accept, dismiss, and accept-all controls. Suggestions do not remove anything until accepted. Re-running detection must preserve manual edits and accepted cuts.
- Replace destructive Apply operations with reversible **Silence** and **Cut both tracks** actions. Keep original/edited playback comparison and a review mode for auditioning affected regions.
- Schedule both tracks against the same audio clock. Reuse the existing fades, resolving any preview/export differences so the export matches what was auditioned.
- Support different file lengths by treating the shorter track’s missing tail as silence. Never shift or stretch either recording.

## Transcript and project saving

- Move transcript ownership out of the panel and into the project. Each track stores its source identity, speaker name, original word timestamps, and transcription status.
- Transcribe tracks separately using the existing local engine and a sequential job queue. Merge results into speaker-labelled turns ordered by source time; retain overlapping speech and highlight both speakers when appropriate.
- Clicking a word seeks the shared playhead and identifies its track. Text selection immediately highlights the relevant waveform ranges.
- **Silence selected speech** affects only the selected words’ owning tracks. **Cut both tracks** removes the full shared time span between the selection boundaries, including any overlapping speech; show that scope across both lanes before activation.
- Preserve original word timestamps through edits. Derive edited display times from the shared cut map instead of retranscribing. Muted words remain visibly muted; cut passages remain recoverable in the original/review view.
- Introduce a version-2 `.hre.json` project containing source references, speaker names, transcripts, detection settings/results, silence edits, shared cuts, and workspace state.
- Keep Cmd+S, add Open Project/Save As, and autosave changes—including completed transcripts—after the project has a save location. Use atomic writes and visible Saving/Saved/Unsaved status.
- Reference source audio rather than duplicating it. Prefer relative paths; support relinking missing files and verify source identity before reusing timestamps.
- Load legacy single-track projects, preserving their marks as track-silence regions. If their saved duration differs from the source, require reconciliation rather than silently treating the timings as valid. Previously baked audio edits cannot be recovered from the old project file alone.

## Workspace layout

- **Top bar:** project name, import/open, save status, undo/redo, Export.
- **Resizable left pane:** Transcript, Cleanup, and Edits tabs. Transcript is the default; settings and review lists occupy this same pane rather than adding permanent rows or another column.
- **Main workspace:** two aligned waveform lanes with speaker names, active-track indication, shared ruler, and a shared cut lane. Silence shading belongs to its track; cuts visibly span both.
- **Bottom transport:** play/pause, edited time and duration, original/edited preview, and the existing IN/OUT loop controls.
- Use one stable selection-action area shared by text and waveform selection. Label actions with their scope—such as **Silence Alex** or **Cut both tracks**—and keep controls from shifting during selection.
- Preserve word-click seeking, live word highlighting, immediate selection feedback, and keyboard navigation. Retain `M` for silence marking; shared cutting uses an explicitly labelled action.
- At smaller window widths, collapse the left pane without hiding transport or making the entire application vertically scroll.

## Export and acceptance

- Offer **Separate tracks**, **Combined mix**, or **Both** through the existing Export entry point.
- Render from one immutable project snapshot and one shared sample-frame cut schedule. Separate WAVs must have identical sample rates and frame counts, with only their own silence edits applied.
- Preserve separate-track levels and channel layouts. Default the combined stereo mix to equal contributions with fixed headroom: each of the two tracks contributes at half gain, mono tracks centred. Add no normalization, compression, or other effects.
- Retain single-track editing and export.

Validate:

- Silencing either speaker leaves the other track and project duration unchanged.
- Repeated cuts preserve alignment and identical exported frame counts, including unequal source lengths.
- Preview and exported audio agree; undo restores cuts, silences, and transcript visibility.
- Save/reopen restores both transcripts without invoking transcription again.
- Missing/changed source files, failed saves, legacy projects, cancelled jobs, and stale results are handled without discarding valid work.
- Overlapping speech, selections across speakers, word seeking, and playback highlighting remain correct after cuts.
- The layout works at the current default and minimum window sizes, with responsive selection on long recordings.

Implement the project/save model first, shared playback and editing second, then the merged transcript and workspace layout, followed by export and end-to-end verification.
