<script lang="ts">
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { renderEdited } from "$lib/audio/applyEdits";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { encodeWav } from "$lib/audio/encodeWav";
  import {
    alignRenders,
    combineRenders,
    frameCount,
    padToFrames,
    renderForExport,
  } from "$lib/audio/exportMix";
  import { editor, MAX_TRACKS } from "$lib/editor.svelte";
  import {
    joinPath,
    mixFileName,
    projectStem,
    separateTrackFileNames,
  } from "$lib/exportNames";
  import { sha256Hex } from "$lib/hash";
  import { player } from "$lib/player";
  import { parseProjectFile, sidecarPath } from "$lib/projectFile";
  import {
    parsePodcastProject,
    resolveSourcePath,
    serializePodcastProject,
    type PodcastProject,
  } from "$lib/projectV2";
  import { vadDetector } from "$lib/vadDetector";
  import PageLayout from "$lib/components/baseline/PageLayout.svelte";
  import Toolbar, {
    type ViewMode,
  } from "$lib/components/baseline/Toolbar.svelte";
  import ViewPanel from "$lib/components/baseline/ViewPanel.svelte";
  import FileMenu, { type ExportChoice } from "$lib/components/FileMenu.svelte";
  import SelectionActions from "$lib/components/SelectionActions.svelte";
  import TimelineStack from "$lib/components/TimelineStack.svelte";
  let tab = $state("cleanup");
  let paneOpen = $state(false);
  let view: ViewMode = $state("both");
  let menuOpen = $state(false);
  let windowWidth = $state(1180);
  $effect(() => {
    if (windowWidth < 900) paneOpen = false;
  });
  $effect(() => {
    if (editor.hasSelection)
      editor.cutScopePreview = editor.markerAction === "cut";
  });
  import CutLane from "$lib/components/CutLane.svelte";
  import SilenceControls from "$lib/components/SilenceControls.svelte";
  import TranscriptPanel from "$lib/components/TranscriptPanel.svelte";

  // Spin up the VAD worker at app start rather than waiting for the first
  // Detect click — see vadDetector.warmUp() for why that timing matters.
  vadDetector.warmUp();

  const AUDIO_FILTER = [
    {
      name: "Audio",
      extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aiff"],
    },
  ];
  const PROJECT_FILTER = [{ name: "Recor Project", extensions: ["json"] }];
  /** Debounce so a run of quick edits (a drag, a settings slider) writes once, not on every intermediate tick. */
  const AUTOSAVE_DELAY_MS = 1500;

  interface LoadedAudio {
    buffer: AudioBuffer;
    mono: Float32Array;
    sha256: string;
    path: string;
    name: string;
  }

  let isLoading = $state(false);
  let loadError: string | null = $state(null);
  let isSaving = $state(false);
  let blockedSavePath: string | null = null;
  let saveError: string | null = $state(null);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let exportStage = $state("");
  let exportError: string | null = $state(null);
  let exportStatus: string | null = $state(null);
  let exportStatusTimeout: ReturnType<typeof setTimeout> | undefined;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  const showCutLane = $derived(
    editor.tracks.length > 1 ||
      editor.cuts.length > 0 ||
      editor.cutSuggestionList.length > 0,
  );

  /**
   * Read, hash, and decode a recording in that order: `decodeAudioFile`
   * takes ownership of (detaches) `bytes`' backing buffer, so hashing has
   * to see the raw bytes first — see `hash.ts`/`decode.ts`.
   */
  async function readAndHashAudio(path: string): Promise<LoadedAudio> {
    // The command returns a raw ipc::Response, which invoke() surfaces as an
    // ArrayBuffer. Falls back to a plain number array on platforms where that
    // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
    const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", {
      path,
    });
    const bytes =
      raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
    const sha256 = await sha256Hex(bytes);
    const buffer = await decodeAudioFile(bytes, player.getContext());
    return {
      buffer,
      mono: mixToMono(buffer),
      sha256,
      path,
      name: path.split(/[\\/]/).pop() ?? path,
    };
  }

  async function pickAudio(title?: string): Promise<string | null> {
    const selected = await open({
      multiple: false,
      title,
      filters: AUDIO_FILTER,
    });
    return selected && !Array.isArray(selected) ? selected : null;
  }

  async function pickAudioFiles(): Promise<string[] | null> {
    const selected = await open({
      multiple: true,
      title: "Import recordings (one or two synced tracks)",
      filters: AUDIO_FILTER,
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected : [selected];
  }

  /**
   * Import one or two already-synced recordings. One file on an empty
   * project also restores a sidecar if one sits next to it. One extra
   * file on a single-track project adds the second lane; anything else
   * starts a new session from the chosen files.
   */
  async function importRecordings(): Promise<void> {
    loadError = null;
    let selected: string[] | null;
    try {
      selected = await pickAudioFiles();
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected || selected.length === 0) return;
    const paths = [...new Set(selected)];
    if (paths.length > MAX_TRACKS) {
      loadError = `Import at most ${MAX_TRACKS} recordings.`;
      return;
    }

    const addSecond = editor.canAddTrack && paths.length === 1;
    isLoading = true;
    if (!addSecond) {
      blockedSavePath = null;
      saveError = null;
    }
    try {
      const loaded = await Promise.all(
        paths.map((path) => readAndHashAudio(path)),
      );
      player.pause();
      if (addSecond) {
        editor.addTrack(
          loaded[0].buffer,
          loaded[0].name,
          loaded[0].mono,
          loaded[0].path,
          loaded[0].sha256,
        );
        return;
      }
      const [first, second] = loaded;
      editor.loadAudio(
        first.buffer,
        first.name,
        first.mono,
        first.path,
        first.sha256,
      );
      if (second)
        editor.addTrack(
          second.buffer,
          second.name,
          second.mono,
          second.path,
          second.sha256,
        );
      else await loadProjectIfPresent(first);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Restore a previously saved sidecar for a just-opened recording, if one
   * exists. A missing or unreadable sidecar is the normal first-open case,
   * so it silently leaves the freshly-loaded (empty) marks in place rather
   * than surfacing an error.
   */
  async function loadProjectIfPresent(loaded: LoadedAudio): Promise<void> {
    const path = sidecarPath(loaded.path);
    try {
      const text = await invoke<string | null>("read_text_file", { path });
      if (text) await applyProjectText(text, path, loaded);
    } catch (error) {
      blockedSavePath = path;
      loadError =
        describeError(error) +
        " The saved project is protected; use Save As for a new project.";
    }
  }

  /**
   * Apply a loaded project's text against a just-opened recording, trying
   * the current (version 2) format first and falling back to a version-1
   * sidecar from before `projectV2.ts` existed. Silently leaves the
   * freshly-loaded (empty) marks in place if neither format parses — a
   * corrupt sidecar should never block opening the audio itself.
   */
  async function applyProjectText(
    text: string,
    path: string,
    preloaded: LoadedAudio,
  ): Promise<void> {
    let project: PodcastProject;
    try {
      project = parsePodcastProject(text);
    } catch {
      // Not a valid version-2 project — fall through to the legacy format.
      const legacy = parseProjectFile(text);
      if (!legacy) throw new Error("The saved project could not be read.");
      if (Math.abs(legacy.durationSec - preloaded.buffer.duration) > 0.01)
        throw new Error(
          "The legacy project duration differs from this recording. Locate the original audio before reusing its marks.",
        );
      editor.applyLegacyProject(legacy, path);
      return;
    }
    await openParsedProject(project, path, preloaded, false);
  }

  /**
   * Load every track a parsed project references and hand them to the
   * editor in the project's own order, so each saved track lines up with
   * the recording decoded for it (see `EditorState.applyProjectV2`).
   * `preloaded` is a recording that's already open, so opening a project
   * from its own audio doesn't decode that file twice. With `allowRelink`,
   * a source that has moved prompts for its new location; otherwise a
   * second track that can't be read is simply left out rather than
   * blocking the rest of the project.
   */
  async function openParsedProject(
    project: PodcastProject,
    projectPath: string,
    preloaded: LoadedAudio | null,
    allowRelink: boolean,
  ): Promise<void> {
    const loaded: LoadedAudio[] = [];
    for (const [index, track] of project.tracks.entries()) {
      if (index === 0 && preloaded) {
        loaded.push(preloaded);
        continue;
      }
      const resolved = resolveSourcePath(projectPath, track.source.path);
      try {
        loaded.push(await readAndHashAudio(resolved));
        continue;
      } catch (err) {
        if (!allowRelink) {
          // Nothing to prompt with (this project came along for the ride
          // with an audio file the user opened): keep whatever loaded.
          throw new Error(
            "A source is missing. Use Open Project to relink all recordings before saving.",
          );
        }
      }
      // Moved or renamed since the project was saved — ask where it went.
      const relocated = await pickAudio(`Locate "${track.source.name}"`);
      if (!relocated) return;
      loaded.push(await readAndHashAudio(relocated));
    }
    if (loaded.length === 0) return;

    for (let i = 0; i < loaded.length; i++) {
      if (
        loaded[i].sha256 !== project.tracks[i].source.sha256 ||
        Math.abs(
          loaded[i].buffer.duration - project.tracks[i].source.duration,
        ) > 0.01
      )
        throw new Error(
          'Source "' +
            project.tracks[i].speaker +
            '" differs from the saved recording. Relink the original source to preserve its timings. The current project has not been replaced.',
        );
    }
    const [first, ...rest] = loaded;
    editor.loadAudio(
      first.buffer,
      first.name,
      first.mono,
      first.path,
      first.sha256,
    );
    for (const track of rest)
      editor.addTrack(
        track.buffer,
        track.name,
        track.mono,
        track.path,
        track.sha256,
      );
    editor.applyProjectV2(project, projectPath);
  }

  /**
   * Open a `.hre.json` project file directly, without opening its
   * recordings first — for a project saved somewhere other than next to
   * its audio (see `saveProjectAs`). `editor.applyProjectV2` verifies each
   * resolved file's actual identity against what the project remembers
   * before reusing any of its marks or transcript timestamps.
   */
  async function openProject(): Promise<void> {
    loadError = null;
    saveError = null;

    let selected: string | string[] | null;
    try {
      selected = await open({ multiple: false, filters: PROJECT_FILTER });
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected || Array.isArray(selected)) return;

    isLoading = true;
    try {
      const text = await invoke<string | null>("read_text_file", {
        path: selected,
      });
      if (!text) throw new Error("Project file not found.");
      let project: PodcastProject;
      try {
        project = parsePodcastProject(text);
      } catch (err) {
        throw new Error(`Not a valid project file: ${describeError(err)}`);
      }
      await openParsedProject(project, selected, null, true);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Write the project. `destination` picks a new save location (see
   * `saveProjectAs`); otherwise reuses `editor.projectPath` if the
   * project has one, or falls back to the sidecar convention on first
   * save. Captures `editor.revision` before building/writing the
   * snapshot so a save only marks itself clean through the edits it
   * actually captured — see `EditorState.markSaved`.
   */
  async function saveProject(destination?: string): Promise<void> {
    if (!editor.filePath || isSaving) return;
    const path =
      destination ?? editor.projectPath ?? sidecarPath(editor.filePath);
    if (path === blockedSavePath) {
      saveError =
        "This project could not be restored. Use Save As to preserve the existing file.";
      return;
    }
    const owner = editor.tracks[0];
    isSaving = true;
    saveError = null;
    const revision = editor.revision;
    try {
      const contents = serializePodcastProject(editor.toProjectV2(path));
      await invoke("write_text_file", { path, contents });
      if (editor.tracks[0] === owner) {
        editor.projectPath = path;
        editor.markSaved(revision);
      }
    } catch (err) {
      saveError = describeError(err);
    } finally {
      isSaving = false;
    }
  }

  /** Choose a new location for the project file, independent of where its recordings live. */
  async function saveProjectAs(): Promise<void> {
    if (!editor.filePath || isSaving) return;
    const stem = (editor.fileName ?? "project").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      destination = await save({
        defaultPath: `${stem}.hre.json`,
        filters: PROJECT_FILTER,
      });
    } catch (err) {
      saveError = describeError(err);
      return;
    }
    if (!destination) return;
    await saveProject(destination);
  }

  // Autosave: once the project has a save location, write it shortly
  // after each change rather than requiring a manual Cmd+S every time —
  // see `editor.dirty`. Re-evaluates whenever `dirty` or `projectPath`
  // change, including right after a save completes (which is what stops
  // the loop once there's nothing left to write).
  $effect(() => {
    const revision = editor.revision;
    const saving = isSaving;
    const failed = saveError;
    const loading = isLoading;
    const dirty = editor.dirty;
    const path = editor.projectPath;
    clearTimeout(autosaveTimer);
    if (dirty && path && !saving && !failed && !loading)
      autosaveTimer = setTimeout(() => void saveProject(), AUTOSAVE_DELAY_MS);
  });

  /** What one two-track Export action writes: one WAV per track, one combined mix, or both. */
  type ExportMode = "separate" | "mix" | "both";

  function trackChannels(buffer: AudioBuffer): Float32Array[] {
    return Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
  }

  /**
   * Encode and write one WAV.
   *
   * `write_audio_file` takes the encoded bytes as a raw binary IPC body
   * rather than a JSON args object — see its Rust-side comment — so the
   * bytes are passed directly as `invoke`'s args and the destination path
   * rides along as a header instead. IPC headers only carry ASCII, and an
   * export's path can hold anything (a speaker's name, an accented
   * folder), so it's percent-encoded here and decoded Rust-side.
   */
  async function writeWav(
    path: string,
    channels: Float32Array[],
    sampleRate: number,
  ): Promise<void> {
    await invoke("write_audio_file", encodeWav(channels, sampleRate), {
      headers: { path: encodeURIComponent(path) },
    });
  }

  async function showExportProgress(
    progress: number,
    stage: string,
  ): Promise<void> {
    exportProgress = Math.max(0, Math.min(1, progress));
    exportStage = stage;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }

  function startExport(choice: ExportChoice): Promise<void> {
    return choice === "recording" ? exportRecording() : exportProject(choice);
  }

  function resetExportUi(): void {
    if (isExporting) return;
    exportProgress = 0;
    exportStage = "";
    exportError = null;
  }

  function flashExported(fileCount: number): void {
    exportStatus = fileCount > 1 ? `Exported ${fileCount} files` : "Exported";
    clearTimeout(exportStatusTimeout);
    exportStatusTimeout = setTimeout(() => (exportStatus = null), 3000);
  }

  /**
   * Render the active track the way the edited preview sounds it — its
   * own silences muted in place, the shared cuts spliced out (see
   * `renderEdited`) — and write it to a user-chosen path. Nothing is
   * baked into the loaded audio, so exporting is repeatable and the
   * project stays editable. This is the single-track project's whole
   * Export; a two-track project goes through `exportProject` instead.
   */
  async function exportRecording(): Promise<void> {
    const track = editor.activeTrack;
    const buffer = track?.audioBuffer;
    if (!track || !buffer || isExporting) return;

    exportError = null;
    const muted = track.markedIntervals.map((r) => ({ ...r }));
    const cuts = editor.cuts.map((r) => ({ ...r }));
    const stem = (track.fileName ?? "export").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      destination = await save({
        defaultPath: `${stem}-edited.wav`,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
    } catch (err) {
      exportError = describeError(err);
      return;
    }
    if (!destination) return;

    isExporting = true;
    exportStatus = null;
    try {
      await showExportProgress(0.08, "Preparing export");
      await showExportProgress(0.25, "Rendering edits");
      const edited = renderEdited(
        trackChannels(buffer),
        buffer.sampleRate,
        muted,
        cuts,
      );
      await showExportProgress(0.7, "Encoding and writing WAV");
      await writeWav(destination, edited, buffer.sampleRate);
      await showExportProgress(1, "Export complete");
      flashExported(1);
    } catch (err) {
      exportError = describeError(err);
    } finally {
      isExporting = false;
    }
  }

  /**
   * Export a two-track project: separate per-track WAVs, one combined
   * mix, or both, from a single directory prompt (N files, so a
   * single-file save dialog doesn't fit).
   *
   * Every mode renders from the same snapshot — each track's own silences
   * muted in place, the project's shared cuts spliced out, then every
   * render padded to the longest — so separate files come out with
   * identical sample rates and frame counts, and the mix agrees with
   * them sample for sample. Levels and channel layouts survive
   * untouched in the separate files; only the mix folds to mono, at half
   * gain per track. Nothing is written back into the loaded audio, so
   * this is repeatable and leaves the project exactly as editable as it
   * was.
   */
  async function exportProject(mode: ExportMode): Promise<void> {
    if (isExporting) return;
    const loaded = editor.tracks.flatMap((track) => {
      const buffer = track.audioBuffer;
      return buffer
        ? [
            {
              buffer,
              speaker: track.speaker,
              muted: track.markedIntervals.map((r) => ({ ...r })),
            },
          ]
        : [];
    });
    if (loaded.length < 2) return;
    const cuts = editor.cuts.map((r) => ({ ...r }));
    const exportStem = projectStem(editor.fileName);

    exportError = null;
    // Lining two rates up means resampling, which is out of scope — say so
    // rather than writing files that drift against each other.
    const sampleRate = loaded[0].buffer.sampleRate;
    const mismatch = loaded.find(
      (entry) => entry.buffer.sampleRate !== sampleRate,
    );
    if (mismatch) {
      exportError =
        `The tracks were recorded at different sample rates (${sampleRate} Hz and ${mismatch.buffer.sampleRate} Hz). ` +
        `Convert them to a single rate and reopen the project — exporting doesn't resample.`;
      return;
    }

    let directory: string | string[] | null;
    try {
      directory = await open({
        directory: true,
        multiple: false,
        title: "Choose a folder for the exported files",
      });
    } catch (err) {
      exportError = describeError(err);
      return;
    }
    if (!directory || Array.isArray(directory)) return;

    isExporting = true;
    exportStatus = null;
    try {
      // `markedIntervals` rather than `mutedIntervalsFor`: an export is
      // always of the edited project, even while the transport is
      // auditioning the original — same as the single-track export.
      const longestFrames = Math.max(...loaded.map((t) => t.buffer.length));
      const stagedRenders: Float32Array[][] = [];
      for (const [index, entry] of loaded.entries()) {
        await showExportProgress(
          0.08 + (0.34 * index) / loaded.length,
          `Rendering ${entry.speaker}`,
        );
        stagedRenders.push(
          renderForExport(
            padToFrames(trackChannels(entry.buffer), longestFrames),
            sampleRate,
            entry.muted,
            cuts,
          ),
        );
      }
      const renders = alignRenders(stagedRenders);
      if (frameCount(renders[0]) === 0) {
        throw new Error(
          "Nothing left to export — the cuts cover the whole project.",
        );
      }

      const stem = exportStem;
      let written = 0;
      const fileTotal =
        mode === "both"
          ? loaded.length + 1
          : mode === "separate"
            ? loaded.length
            : 1;
      if (mode !== "mix") {
        const names = separateTrackFileNames(
          stem,
          loaded.map((entry) => entry.speaker),
        );
        for (const [index, name] of names.entries()) {
          await showExportProgress(
            0.5 + (0.45 * written) / fileTotal,
            `Writing ${name}`,
          );
          await writeWav(joinPath(directory, name), renders[index], sampleRate);
          written++;
        }
      }
      if (mode !== "separate") {
        await showExportProgress(
          0.5 + (0.45 * written) / fileTotal,
          "Mixing and writing combined WAV",
        );
        await writeWav(
          joinPath(directory, mixFileName(stem)),
          combineRenders(renders),
          sampleRate,
        );
        written++;
      }
      await showExportProgress(1, "Export complete");
      flashExported(written);
    } catch (err) {
      exportError = describeError(err);
    } finally {
      isExporting = false;
    }
  }

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function clearNativeSelection(): void {
    window.getSelection()?.removeAllRanges();
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isFormField =
      !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && ["+", "=", "-", "_"].includes(key)) {
      e.preventDefault();
      editor.commitEdit(() =>
        editor.zoomView(key === "-" || key === "_" ? 1.25 : 0.8),
      );
    } else if ((e.metaKey || e.ctrlKey) && key === "s") {
      // Always take over Cmd/Ctrl+S, even in form fields, so the browser's
      // "save page" dialog never has a chance to appear.
      e.preventDefault();
      saveProject();
    } else if ((e.metaKey || e.ctrlKey) && key === "z") {
      // Same takeover as Cmd/Ctrl+S above, even while a slider has focus —
      // otherwise the webview's own text-field undo could swallow the key.
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      player.refreshIfPlaying();
    } else if ((e.metaKey || e.ctrlKey) && key === "y") {
      // Windows/Linux redo convention, alongside Cmd/Ctrl+Shift+Z above.
      e.preventDefault();
      editor.redo();
      player.refreshIfPlaying();
    } else if (e.code === "Space" && !isFormField) {
      e.preventDefault();
      player.toggle();
    } else if (e.code === "Escape" && editor.hasSelection) {
      editor.clearSelection();
      window.getSelection()?.removeAllRanges();
    } else if (key === "m" && !isFormField && editor.hasSelection) {
      e.preventDefault();
      editor.toggleSelectionMark();
      window.getSelection()?.removeAllRanges();
      player.refreshIfPlaying();
    } else if (key === "]" && !isFormField) {
      e.preventDefault();
      player.goToAdjacentMarkedRegion("next");
    } else if (key === "[" && !isFormField) {
      e.preventDefault();
      player.goToAdjacentMarkedRegion("prev");
    }
  }
</script>

<svelte:window bind:innerWidth={windowWidth} onkeydown={onKeydown} />

<PageLayout asideOpen={paneOpen} asideOverlay={windowWidth < 900}>
  {#snippet header()}
    <div class="toolbar-slot">
      <FileMenu
        bind:open={menuOpen}
        showTrigger={false}
        {isLoading}
        {isSaving}
        {isExporting}
        {exportProgress}
        {exportStage}
        {exportError}
        canSave={!!editor.filePath}
        canExport={editor.hasAudio}
        twoTrack={editor.tracks.length > 1}
        onSave={() => saveProject()}
        onSaveAs={saveProjectAs}
        onOpen={openProject}
        onImport={importRecordings}
        onExport={startExport}
        onExportReset={resetExportUi}
      />
      <Toolbar
        bind:menuOpen
        bind:markerType={editor.markerAction}
        bind:view
        bind:asideOpen={paneOpen}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        canMark={editor.hasSelection}
        canUnmark={editor.hasSelection && editor.actionOverlap !== "unmarked"}
        canPlay={editor.hasAudio}
        playing={editor.isPlaying}
        currentSec={editor.playheadKeptSec}
        durationSec={editor.displayKeptDuration}
        preview={editor.preview === "edited"}
        onplay={() => player.toggle()}
        onpreview={() => {
          editor.setPreview(
            editor.preview === "edited" ? "original" : "edited",
          );
          player.refreshIfPlaying();
        }}
        onundo={() => {
          editor.undo();
          player.refreshIfPlaying();
        }}
        onredo={() => {
          editor.redo();
          player.refreshIfPlaying();
        }}
        onmark={() => {
          editor.markAction();
          clearNativeSelection();
          player.refreshIfPlaying();
        }}
        onunmark={() => {
          editor.unmarkAction();
          clearNativeSelection();
          player.refreshIfPlaying();
        }}
        hasSelection={editor.hasSelection}
        onclear={() => {
          editor.clearSelection();
          clearNativeSelection();
        }}
        canZoomIn={editor.hasAudio &&
          editor.viewDurationSec >
            Math.min(0.2, editor.displayKeptDuration) + 1e-6}
        canZoomOut={editor.hasAudio &&
          editor.viewDurationSec < editor.displayKeptDuration - 1e-6}
        canFit={editor.hasAudio &&
          editor.viewDurationSec < editor.displayKeptDuration - 1e-6}
        onzoomin={() => editor.commitEdit(() => editor.zoomView(0.8))}
        onzoomout={() => editor.commitEdit(() => editor.zoomView(1.25))}
        onfit={() =>
          editor.commitEdit(() =>
            editor.setView(0, editor.displayKeptDuration),
          )}
      />
    </div>
  {/snippet}

  {#snippet aside()}
    <nav class="pane-tabs" aria-label="Editor panels">
      {#each ["cleanup", "edits"] as name (name)}
        <button class:active={tab === name} onclick={() => (tab = name)}
          >{name}</button
        >
      {/each}
    </nav>
    <div class="pane-content" hidden={tab !== "cleanup"}>
      <h2>Mark non-speaking audio</h2>
      <p class="pane-hint">
        Choose VAD plus the dB floor, or run the dB silence floor by itself. The
        pass runs across all tracks. Silence gap also controls transcript
        paragraph breaks.
      </p>
      <SilenceControls />
    </div>
    <div class="pane-content" hidden={tab !== "edits"}>
      <h2>Review shared cuts</h2>
      <p class="pane-hint">
        Cut markers affect every track. Preview edits to hear the result; Export
        applies them to new files.
      </p>
      <button
        class="bulk-convert"
        disabled={!editor.tracks.some(
          (track) => track.markedIntervals.length > 0,
        )}
        onclick={() => {
          editor.convertAllSilencesToCuts();
          player.refreshIfPlaying();
        }}
        title="Every per-track silence marker becomes a shared cut across all tracks"
        >Convert all silences to shared cuts</button
      >
      <p class="pane-hint compact">
        This clears the silence markers and places their combined ranges in the
        shared cut lane. Undo restores them.
      </p>
      <CutLane reviewOnly />
      <h2>Marked cuts · {editor.cuts.length}</h2>
      {#each editor.cuts as cut (`${cut.start}-${cut.end}`)}
        <div class="edit-row">
          <button onclick={() => player.audition(cut)}
            >{cut.start.toFixed(1)} – {cut.end.toFixed(1)} s</button
          >
          <button
            onclick={() => {
              editor.restoreCut(cut);
              player.refreshIfPlaying();
            }}>Unmark</button
          >
        </div>
      {/each}
      {#each editor.tracks as track (track.id)}
        <h2>{track.speaker} · {track.markedIntervals.length} silences</h2>
        {#each track.markedIntervals as range (`${track.id}-${range.start}-${range.end}`)}
          <div class="edit-row">
            <button
              onclick={() => {
                editor.setActiveTrack(track.id);
                player.audition(range);
              }}>{range.start.toFixed(1)} – {range.end.toFixed(1)} s</button
            >
            <button
              onclick={() => {
                editor.setSelection(range.start, range.end, [track.id]);
                editor.unmarkSelection();
                player.refreshIfPlaying();
              }}>Unmark</button
            >
          </div>
        {/each}
      {/each}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="file-status">
      <span class="filename"
        >{isLoading
          ? "Opening…"
          : (editor.fileName ?? "No recording loaded")}</span
      >
      {#if saveError}
        <span class="save-status error">Save failed: {saveError}</span>
      {:else if isSaving}
        <span class="save-status">Saving…</span>
      {:else if editor.projectPath}
        <span class="save-status"
          >{editor.dirty ? "Unsaved changes" : "Saved"}</span
        >
      {/if}
      {#if exportStatus}
        <span class="save-status">{exportStatus}</span>
      {/if}
    </div>
    <SelectionActions />
  {/snippet}

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}
  {#if exportError}
    <p class="error">Export failed: {exportError}</p>
  {/if}

  <ViewPanel title="Transcript" open={view !== "audio"} collapsible={false}>
    <TranscriptPanel showSelectionActions={false} />
  </ViewPanel>
  <ViewPanel title="Audio" open={view !== "transcript"} collapsible={false}>
    <TimelineStack />
  </ViewPanel>
</PageLayout>

<style>
  .toolbar-slot,
  .file-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .toolbar-slot {
    position: relative;
    flex: 1;
    flex-wrap: nowrap;
  }

  .filename {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--cream-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-status {
    font-size: 0.8rem;
    color: var(--out-color);
  }

  .save-status.error {
    color: var(--in-color);
  }

  .pane-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.65rem 0.75rem 0;
  }

  .pane-tabs button {
    flex: 1;
    text-transform: capitalize;
    font-size: 0.75rem;
  }

  .pane-tabs button.active {
    background: var(--amber);
    color: var(--chassis);
  }

  .pane-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
  }

  .pane-content[hidden] {
    display: none;
  }

  h2 {
    font-size: 0.85rem;
    margin: 0.5rem 0 1rem;
  }

  .pane-hint {
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--cream-dim);
    margin-bottom: 1.5rem;
  }

  .pane-hint.compact {
    margin-bottom: 1rem;
    line-height: 1.4;
  }

  .edit-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .edit-row button {
    font-size: 0.7rem;
  }

  .bulk-convert {
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .error {
    margin: 0;
    padding: 0.6rem 1rem;
    background: rgba(209, 73, 91, 0.15);
    border-bottom: 1px solid var(--in-color);
    color: var(--in-color);
    font-size: 0.85rem;
  }

  @media (max-width: 1100px) {
    .filename {
      display: none;
    }
  }
</style>
