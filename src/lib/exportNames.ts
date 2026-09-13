/**
 * Filesystem-safe names for exported files, derived from the project name
 * and each track's speaker. Pure string work — the directory picker and
 * the write itself live in `+page.svelte`.
 */

/** Path separators, Windows-reserved punctuation, and control characters. */
const UNSAFE = /[\\/:*?"<>|\x00-\x1f]/g;

/** Keeps a single derived name well clear of any filesystem's per-component limit. */
const MAX_PART_LENGTH = 60;

/** Leading/trailing dots, dashes and spaces — none of them carry meaning at either end of a name. */
const EDGE_NOISE_START = /^[.\-\s]+/;
const EDGE_NOISE_END = /[.\-\s]+$/;

/**
 * Turn arbitrary user text (a speaker name, a recording's stem) into one
 * safe path component: reserved characters become "-", control characters
 * and runs of whitespace collapse to a single space, and leading dots go
 * so an export can never land on a hidden file. Falls back to `fallback`
 * when nothing usable is left — including a name that was *only* reserved
 * characters, which would otherwise export as a row of dashes.
 */
export function sanitizeFileNamePart(text: string, fallback: string): string {
  const trimmed = text
    // Control characters read as whitespace rather than becoming dashes,
    // so a stray newline doesn't leave "Alex Kim -".
    .replace(/[\x00-\x1f]/g, " ")
    .replace(UNSAFE, "-")
    .replace(/\s+/g, " ")
    .replace(EDGE_NOISE_START, "")
    // Windows drops trailing dots and spaces from a name; strip them here
    // so what's written matches what was asked for.
    .replace(EDGE_NOISE_END, "");
  // Array.from iterates by code point rather than UTF-16 code unit, so
  // truncating through it can only ever drop whole characters — a plain
  // string `.slice()` can cut a surrogate pair in half (an emoji, some CJK
  // Extension B ideographs), and `encodeURIComponent` throws on the
  // unpaired surrogate that leaves behind (see `+page.svelte`'s export
  // path encoding), aborting the export.
  const cleaned = Array.from(trimmed).slice(0, MAX_PART_LENGTH).join("").replace(EDGE_NOISE_END, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

/** The project's name for export purposes: the primary recording's file name without its extension. */
export function projectStem(fileName: string | null): string {
  return sanitizeFileNamePart((fileName ?? "Untitled").replace(/\.[^./\\]+$/, ""), "Untitled");
}

/**
 * One `<stem>-<speaker>-edited.wav` per track, in lane order. Two lanes
 * left on the same speaker name would otherwise write the same file
 * twice, silently exporting one track over the other, so a repeat gets
 * its lane number appended.
 */
export function separateTrackFileNames(stem: string, speakers: string[]): string[] {
  const used = new Set<string>();
  return speakers.map((speaker, index) => {
    const part = sanitizeFileNamePart(speaker, `track-${index + 1}`);
    const preferred = `${stem}-${part}-edited.wav`;
    const name = used.has(preferred.toLowerCase()) ? `${stem}-${part}-${index + 1}-edited.wav` : preferred;
    used.add(name.toLowerCase());
    return name;
  });
}

/** The combined mix's file name. */
export function mixFileName(stem: string): string {
  return `${stem}-mix.wav`;
}

/**
 * Join a picked directory and a file name. The separator comes from the
 * directory itself so a Windows path stays backslashed, rather than
 * assuming the platform in a module that's otherwise pure.
 */
export function joinPath(directory: string, fileName: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  const trimmed = directory.replace(/[\\/]+$/, "");
  return trimmed.length > 0 ? `${trimmed}${separator}${fileName}` : `${separator}${fileName}`;
}
