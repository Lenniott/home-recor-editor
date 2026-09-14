import { mixToMono } from "./audio/decode";
import type { EditorState } from "./editor.svelte";
import { sha256Hex } from "./hash";
import { sidecarPath } from "./projectFile";
import { parsePodcastProject, serializePodcastProject } from "./projectV2";

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

export async function openRecordings({
  files,
  desktop,
  editor,
}: {
  files: string[];
  desktop: DesktopAdapter;
  editor: EditorState;
}) {
  const path = files[0];
  const bytes = await desktop.readAudio(path);
  const sha256 = await sha256Hex(bytes);
  const buffer = await desktop.decodeAudio(bytes);
  const name = path.split(/[\\/]/).pop() ?? path;
  editor.loadAudio(buffer, name, mixToMono(buffer), path, sha256);

  const companionPath = sidecarPath(path);
  try {
    const text = await desktop.readText(companionPath);
    if (text) {
      const project = parsePodcastProject(text);
      editor.applyProjectV2(project, companionPath);
    }
  } catch (err) {
    return {
      tracks: editor.tracks,
      projectPath: null as string | null,
      error: `${describeError(err)} The saved project is protected; use Save As for a new project.`,
      blockedSavePath: companionPath,
    };
  }

  return {
    tracks: editor.tracks,
    projectPath: editor.projectPath,
    error: null as string | null,
    blockedSavePath: null as string | null,
  };
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
  const revision = editor.revision;
  await desktop.writeText(
    path,
    serializePodcastProject(editor.toProjectV2(path)),
  );
  editor.projectPath = path;
  editor.markSaved(revision);
  return { error: null as string | null, projectPath: path };
}
