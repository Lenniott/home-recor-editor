import { mixToMono } from "./audio/decode";
import { MAX_TRACKS, type EditorState } from "./editor.svelte";
import { sha256Hex } from "./hash";
import { parseProjectFile, sidecarPath } from "./projectFile";
import { parsePodcastProject, resolveSourcePath, serializePodcastProject } from "./projectV2";

/**
 * Desktop adapter at the project-session seam: files and decode. Tests
 * inject in-memory files and a fake AudioBuffer; the page injects Tauri
 * plus Web Audio. Pick/dialogs stay outside this module.
 */
export type DesktopAdapter = {
  readAudio: (path: string) => Promise<Uint8Array>;
  readText: (path: string) => Promise<string | null>;
  writeText: (path: string, contents: string) => Promise<void>;
  decodeAudio: (bytes: Uint8Array) => Promise<AudioBuffer>;
};

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readRecording(
  path: string,
  desktop: DesktopAdapter,
) {
  const bytes = await desktop.readAudio(path);
  const sha256 = await sha256Hex(bytes);
  const buffer = await desktop.decodeAudio(bytes);
  return {
    buffer,
    sha256,
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    mono: mixToMono(buffer),
  };
}

function sessionResult(
  editor: EditorState,
  error: string | null,
  blockedSavePath: string | null,
) {
  return {
    tracks: editor.tracks,
    projectPath: editor.projectPath,
    error,
    blockedSavePath,
  };
}

export async function openRecordings({
  files,
  desktop,
  editor,
  blockedSavePath = null,
}: {
  files: string[];
  desktop: DesktopAdapter;
  editor: EditorState;
  blockedSavePath?: string | null;
}) {
  if (files.length > MAX_TRACKS) {
    return sessionResult(
      editor,
      `Import at most ${MAX_TRACKS} recordings.`,
      blockedSavePath,
    );
  }
  if (editor.tracks.length + files.length > MAX_TRACKS) {
    return sessionResult(
      editor,
      "A project can have at most two recordings.",
      blockedSavePath,
    );
  }

  const alreadyOpen = new Set(
    editor.tracks.flatMap((track) => (track.filePath ? [track.filePath] : [])),
  );
  for (const path of files) {
    if (alreadyOpen.has(path)) {
      return sessionResult(
        editor,
        "That recording is already in this project.",
        blockedSavePath,
      );
    }
    alreadyOpen.add(path);
  }

  const replacing = editor.tracks.length === 0;
  const first = await readRecording(files[0], desktop);
  if (replacing) {
    editor.loadAudio(
      first.buffer,
      first.name,
      first.mono,
      first.path,
      first.sha256,
    );
  } else {
    editor.addTrack(
      first.buffer,
      first.name,
      first.mono,
      first.path,
      first.sha256,
    );
  }
  for (const path of files.slice(1)) {
    const extra = await readRecording(path, desktop);
    editor.addTrack(
      extra.buffer,
      extra.name,
      extra.mono,
      extra.path,
      extra.sha256,
    );
  }

  if (!replacing || files.length !== 1) {
    return sessionResult(editor, null, replacing ? null : blockedSavePath);
  }

  const companionPath = sidecarPath(files[0]);
  try {
    const text = await desktop.readText(companionPath);
    if (text) {
      try {
        const project = parsePodcastProject(text);
        editor.applyProjectV2(project, companionPath);
      } catch (err) {
        const legacy = parseProjectFile(text);
        if (!legacy) throw err;
        if (Math.abs(legacy.durationSec - first.buffer.duration) > 0.01) {
          return sessionResult(
            editor,
            "Legacy duration mismatches require the original recording.",
            null,
          );
        }
        editor.applyLegacyProject(legacy, companionPath);
      }
    }
  } catch (err) {
    return sessionResult(
      editor,
      `${describeError(err)} The saved project is protected; use Save As for a new project.`,
      companionPath,
    );
  }

  return sessionResult(editor, null, null);
}

export async function saveProject({
  editor,
  desktop,
  blockedSavePath,
  destination,
}: {
  editor: EditorState;
  desktop: DesktopAdapter;
  blockedSavePath: string | null;
  destination?: string;
}) {
  if (!editor.filePath) {
    return { error: null as string | null, projectPath: editor.projectPath };
  }
  const path =
    destination ?? editor.projectPath ?? sidecarPath(editor.filePath);
  if (path === blockedSavePath) {
    return {
      error:
        "This project could not be restored. Use Save As to preserve the existing file.",
      projectPath: editor.projectPath,
    };
  }
  if (!destination && path !== editor.projectPath) {
    let occupied = false;
    try {
      occupied = (await desktop.readText(path)) !== null;
    } catch {
      occupied = true;
    }
    if (occupied) {
      return {
        error:
          "A project file already exists at this name. Use Save As to keep it.",
        projectPath: editor.projectPath,
      };
    }
  }
  const revision = editor.revision;
  await desktop.writeText(
    path,
    serializePodcastProject(editor.toProjectV2(path)),
  );
  editor.projectPath = path;
  editor.markSaved(revision);
  return { error: null as string | null, projectPath: path };
}

export const AUTOSAVE_DELAY_MS = 1500;

export function shouldAutosave({
  dirty,
  projectPath,
  saving = false,
  failed = false,
  loading = false,
}: {
  dirty: boolean;
  projectPath: string | null;
  saving?: boolean;
  failed?: boolean;
  loading?: boolean;
}): boolean {
  return Boolean(dirty && projectPath && !saving && !failed && !loading);
}

export function scheduleAutosave({
  editor,
  desktop,
  blockedSavePath,
  delayMs = AUTOSAVE_DELAY_MS,
  saving = false,
  failed = false,
  loading = false,
}: {
  editor: EditorState;
  desktop: DesktopAdapter;
  blockedSavePath: string | null;
  delayMs?: number;
  saving?: boolean;
  failed?: boolean;
  loading?: boolean;
}): ReturnType<typeof setTimeout> | null {
  if (
    !shouldAutosave({
      dirty: editor.dirty,
      projectPath: editor.projectPath,
      saving,
      failed,
      loading,
    })
  ) {
    return null;
  }
  return setTimeout(() => {
    void saveProject({ editor, desktop, blockedSavePath });
  }, delayMs);
}

export type LocateRecording = (name: string) => Promise<string | null>;

export async function openProjectFile({
  path,
  desktop,
  editor,
  locate,
}: {
  path: string;
  desktop: DesktopAdapter;
  editor: EditorState;
  locate: LocateRecording;
}) {
  const text = await desktop.readText(path);
  if (!text) {
    return sessionResult(editor, "Project file not found.", null);
  }
  let project;
  try {
    project = parsePodcastProject(text);
  } catch {
    if (parseProjectFile(text)) {
      return sessionResult(
        editor,
        "This is a legacy project file. Import the recording beside it to restore marks.",
        null,
      );
    }
    return sessionResult(editor, "Not a valid project file.", null);
  }

  const loaded: Awaited<ReturnType<typeof readRecording>>[] = [];
  for (const track of project.tracks) {
    const resolved = resolveSourcePath(path, track.source.path);
    try {
      loaded.push(await readRecording(resolved, desktop));
    } catch {
      const relocated = await locate(track.source.name);
      if (!relocated) {
        return sessionResult(
          editor,
          `Couldn't locate "${track.source.name}". The current project has not been replaced.`,
          null,
        );
      }
      loaded.push(await readRecording(relocated, desktop));
    }
  }

  for (let i = 0; i < loaded.length; i++) {
    if (
      loaded[i].sha256 !== project.tracks[i].source.sha256 ||
      Math.abs(loaded[i].buffer.duration - project.tracks[i].source.duration) > 0.01
    ) {
      return sessionResult(
        editor,
        `Source "${project.tracks[i].speaker}" differs from the saved recording. Relink the original source to preserve its timings. The current project has not been replaced.`,
        null,
      );
    }
  }

  const [first, ...rest] = loaded;
  editor.loadAudio(first.buffer, first.name, first.mono, first.path, first.sha256);
  for (const extra of rest) {
    editor.addTrack(extra.buffer, extra.name, extra.mono, extra.path, extra.sha256);
  }
  editor.applyProjectV2(project, path);
  return sessionResult(editor, null, null);
}
