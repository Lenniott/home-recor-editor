<script lang="ts">
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { renderEdited } from "$lib/audio/applyEdits";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { encodeWav } from "$lib/audio/encodeWav";
  import { editor } from "$lib/editor.svelte";
  import { sha256Hex } from "$lib/hash";
  import { player } from "$lib/player";
  import { resolveSourcePath, type PodcastProject } from "$lib/projectV2";
  import {
    AUTOSAVE_DELAY_MS,
    openProjectFile,
    openRecordings,
    saveProject as writeProjectFile,
    scheduleAutosave,
  } from "$lib/projectSession";
  import { runExport } from "$lib/exportSession";
  import { vadDetector } from "$lib/vadDetector";
  import PageLayout from "$lib/components/baseline/PageLayout.svelte";
  import Toolbar, {
    type ViewMode,
  } from "$lib/components/baseline/Toolbar.svelte";
  import ViewPanel from "$lib/components/baseline/ViewPanel.svelte";
  import FileMenu, { type ExportRequest } from "$lib/components/FileMenu.svelte";
  import Button from "$lib/components/baseline/Button.svelte";
  import SelectionActions from "$lib/components/SelectionActions.svelte";
  import TimelineStack from "$lib/components/TimelineStack.svelte";
  let tab = $state("cleanup");
  let paneOpen = $state(false);
  let view: ViewMode = $state("both");
  let menuOpen = $state(false);
  let openAsTranscript = $state(false);
  let windowWidth = $state(1180);
  $effect(() => {
    if (windowWidth < 900) paneOpen = false;
  });
  $effect(() => {
    if (editor.hasSelection)
      editor.cutScopePreview = editor.markerAction === "cut";
  });
  import CutLane from "$lib/components/CutLane.svelte";
  import MarksList from "$lib/components/MarksList.svelte";
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
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  type TestDesktopIo = {
    files: Record<string, Uint8Array | string>;
    pickFiles?: string[] | null;
    pickFile?: string | null;
    pickSave?: string | null;
    pickDirectory?: string | null;
  };

  function testDesktop(): TestDesktopIo | undefined {
    return (globalThis as { __HRE_TEST__?: TestDesktopIo }).__HRE_TEST__;
  }

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

  const showCutLane = $derived(
    editor.tracks.length > 1 ||
      editor.cuts.length > 0 ||
      editor.cutSuggestionList.length > 0,
  );
  const exportMarkCount = $derived.by(() => {
    editor.revision;
    return editor.markerList.all().filter((marker) => marker.type === "export").length;
  });

  async function readAudioBytes(path: string): Promise<Uint8Array> {
    const io = testDesktop();
    if (io) {
      const data = io.files[path];
      if (data instanceof Uint8Array) return data.slice();
      throw new Error(`No virtual audio at ${path}`);
    }
    // The command returns a raw ipc::Response, which invoke() surfaces as an
    // ArrayBuffer. Falls back to a plain number array on platforms where that
    // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
    const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", {
      path,
    });
    return raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : Uint8Array.from(raw);
  }

  function tauriDesktop() {
    const io = testDesktop();
    if (io) {
      return {
        readAudio: readAudioBytes,
        readText: async (path: string) => {
          const data = io.files[path];
          return typeof data === "string" ? data : null;
        },
        writeText: async (path: string, contents: string) => {
          io.files[path] = contents;
        },
        decodeAudio: (bytes: Uint8Array) =>
          decodeAudioFile(bytes, player.getContext()),
      };
    }
    return {
      readAudio: readAudioBytes,
      readText: (path: string) =>
        invoke<string | null>("read_text_file", { path }),
      writeText: async (path: string, contents: string) => {
        await invoke("write_text_file", { path, contents });
      },
      decodeAudio: (bytes: Uint8Array) =>
        decodeAudioFile(bytes, player.getContext()),
    };
  }

  /**
   * Read, hash, and decode a recording in that order: `decodeAudioFile`
   * takes ownership of (detaches) `bytes`' backing buffer, so hashing has
   * to see the raw bytes first — see `hash.ts`/`decode.ts`.
   */
  async function readAndHashAudio(path: string): Promise<LoadedAudio> {
    const bytes = await readAudioBytes(path);
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
    const io = testDesktop();
    if (io) {
      const selected = io.pickFile ?? null;
      io.pickFile = undefined;
      return selected;
    }
    const selected = await open({
      multiple: false,
      title,
      filters: AUDIO_FILTER,
    });
    return selected && !Array.isArray(selected) ? selected : null;
  }

  async function pickAudioFiles(): Promise<string[] | null> {
    const io = testDesktop();
    if (io) {
      const selected = io.pickFiles ?? null;
      io.pickFiles = undefined;
      return selected;
    }
    const selected = await open({
      multiple: true,
      title: "Import recordings (one or two synced tracks)",
      filters: AUDIO_FILTER,
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected : [selected];
  }

  /**
   * Import recordings into this session. An empty session starts from the
   * chosen files (one file may restore a companion project). A session that
   * already has a lane attaches another, up to two. File → New starts over.
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

    isLoading = true;
    saveError = null;
    try {
      player.pause();
      const result = await openRecordings({
        files: paths,
        desktop: tauriDesktop(),
        editor,
        blockedSavePath,
      });
      loadError = result.error;
      blockedSavePath = result.blockedSavePath;
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  async function addRecording(): Promise<void> {
    if (!editor.canAddTrack) return;
    loadError = null;
    let path: string | null;
    try {
      path = await pickAudio("Add a synced recording");
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!path) return;
    if (editor.tracks.some((track) => track.filePath === path)) {
      loadError = "That recording is already in this project.";
      return;
    }
    isLoading = true;
    try {
      const loaded = await readAndHashAudio(path);
      player.pause();
      editor.addTrack(
        loaded.buffer,
        loaded.name,
        loaded.mono,
        loaded.path,
        loaded.sha256,
      );
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  function startNewProject(): void {
    if (
      editor.hasAudio &&
      editor.dirty &&
      !confirm("Discard unsaved changes and start a new project?")
    )
      return;
    player.pause();
    editor.newProject();
    loadError = null;
    saveError = null;
    blockedSavePath = null;
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
      if (!relocated) {
        throw new Error(
          `Couldn't locate "${track.source.name}". The current project has not been replaced.`,
        );
      }
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
      const io = testDesktop();
      if (io) {
        selected = io.pickFile ?? null;
        io.pickFile = undefined;
      } else {
        selected = await open({ multiple: false, filters: PROJECT_FILTER });
      }
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected || Array.isArray(selected)) return;

    isLoading = true;
    try {
      const result = await openProjectFile({
        path: selected,
        desktop: tauriDesktop(),
        editor,
        locate: async (name) => pickAudio(`Locate "${name}"`),
      });
      loadError = result.error;
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
    isSaving = true;
    saveError = null;
    try {
      const result = await writeProjectFile({
        editor,
        desktop: tauriDesktop(),
        blockedSavePath,
        destination,
      });
      saveError = result.error;
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
      const io = testDesktop();
      if (io) {
        destination = io.pickSave ?? null;
        io.pickSave = undefined;
      } else {
        destination = await save({
          defaultPath: `${stem}.hre.json`,
          filters: PROJECT_FILTER,
        });
      }
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
    autosaveTimer =
      scheduleAutosave({
        editor,
        desktop: tauriDesktop(),
        blockedSavePath,
        delayMs: AUTOSAVE_DELAY_MS,
        saving,
        failed: Boolean(failed),
        loading,
      }) ?? undefined;
  });

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
    const bytes = encodeWav(channels, sampleRate);
    const io = testDesktop();
    if (io) {
      io.files[path] = bytes;
      return;
    }
    await invoke("write_audio_file", bytes, {
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

  function startExport(request: ExportRequest): Promise<void> {
    if (!request.includeAudio && !request.includeTranscript) return Promise.resolve();
    const layout =
      request.layout === "recording" && request.scope === "clips" ? "merge" : request.layout;
    if (layout === "recording" && request.includeAudio && !request.includeTranscript) {
      return exportRecording(request.channels);
    }
    return exportProject({ ...request, layout });
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
  async function exportRecording(channels: "mono" | "stereo" = "stereo"): Promise<void> {
    const track = editor.activeTrack;
    const buffer = track?.audioBuffer;
    if (!track || !buffer || isExporting) return;

    exportError = null;
    const muted = track.markedIntervals.map((r) => ({ ...r }));
    const cuts = editor.cuts.map((r) => ({ ...r }));
    const stem = (track.fileName ?? "export").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      const io = testDesktop();
      if (io) {
        destination = io.pickSave ?? null;
        io.pickSave = undefined;
      } else {
        destination = await save({
          defaultPath: `${stem}-edited.wav`,
          filters: [{ name: "WAV", extensions: ["wav"] }],
        });
      }
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
  async function exportProject(request: ExportRequest): Promise<void> {
    if (isExporting) return;
    const loaded = editor.tracks.flatMap((track) => {
      const buffer = track.audioBuffer;
      return buffer
        ? [
            {
              id: track.id,
              buffer,
              speaker: track.speaker,
              muted: track.markedIntervals.map((r) => ({ ...r })),
            },
          ]
        : [];
    });
    if (loaded.length === 0) return;
    if (
      request.scope !== "clips" &&
      loaded.length < 2 &&
      request.includeAudio &&
      !request.includeTranscript
    )
      return;
    const cuts = editor.cuts.map((r) => ({ ...r }));
    const mode = request.layout === "recording" ? "merge" : request.layout;

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
      const io = testDesktop();
      if (io) {
        directory = io.pickDirectory ?? null;
        io.pickDirectory = undefined;
      } else {
        directory = await open({
          directory: true,
          multiple: false,
          title: "Choose a folder for the exported files",
        });
      }
    } catch (err) {
      exportError = describeError(err);
      return;
    }
    if (!directory || Array.isArray(directory)) return;

    isExporting = true;
    exportStatus = null;
    try {
      const result = await runExport({
        mode,
        scope: request.scope,
        channels: request.channels,
        includeAudio: request.includeAudio,
        includeTranscript: request.includeTranscript,
        applyEdits: request.applyEdits,
        marks: editor.markerList
          .all()
          .filter((marker) => marker.type === "export")
          .map((marker) => ({
            start: marker.start,
            end: marker.end,
            laneIds: [...marker.laneIds],
          })),
        tracks: loaded.map((entry) => ({
          id: entry.id,
          channels: trackChannels(entry.buffer),
          sampleRate: entry.buffer.sampleRate,
          speaker: entry.speaker,
          muted: entry.muted,
          fileName: editor.fileName,
          words: editor.tracks.find((track) => track.id === entry.id)?.transcriptWords,
        })),
        cuts,
        directory,
        writeWav,
        writeText: (path, contents) => tauriDesktop().writeText(path, contents),
        fileExists: async (path) => {
          const virtual = testDesktop();
          if (virtual) return Object.prototype.hasOwnProperty.call(virtual.files, path);
          return invoke<boolean>("path_exists", { path });
        },
        onProgress: (progress, stage) => {
          void showExportProgress(progress, stage);
        },
      });
      if (result.error) throw new Error(result.error);
      flashExported(result.written);
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
        canAddRecording={editor.canAddTrack}
        canImport={!editor.hasAudio || editor.canAddTrack}
        twoTrack={editor.tracks.length > 1}
        exportMarkCount={exportMarkCount}
        bind:openAsTranscript
        onSave={() => saveProject()}
        onSaveAs={saveProjectAs}
        onNew={startNewProject}
        onOpen={openProject}
        onImport={importRecordings}
        onAddRecording={addRecording}
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
        <Button
          class="pane-tab"
          variant="secondary"
          toggle
          pressed={tab === name}
          onclick={() => (tab = name)}>{name}</Button
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
        Cmd/Ctrl-click adds marks to the selection. Cmd/Ctrl+A with a lane or this
        list focused selects every mark. Backspace, Delete, or Remove deletes the
        selection in one undo step. Type change applies to every selected mark.
      </p>
      <CutLane reviewOnly />
      {#key editor.revision}
        <h2>Marks · {editor.markerList.all().length}</h2>
      {/key}
      <MarksList />
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

  <ViewPanel
    title="Transcript"
    open={view !== "audio"}
    collapsible={false}
    onexpand={() => (view = "transcript")}
  >
    <TranscriptPanel
      compact={view === "audio"}
      showSelectionActions={false}
      onExportTranscript={() => {
        openAsTranscript = true;
      }}
    />
  </ViewPanel>
  <ViewPanel
    title="Audio"
    open={view !== "transcript"}
    collapsible={false}
    onexpand={() => (view = "audio")}
  >
    <TimelineStack compact={view === "transcript"} />
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

  .pane-tabs :global(.pane-tab) {
    flex: 1;
    text-transform: capitalize;
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
