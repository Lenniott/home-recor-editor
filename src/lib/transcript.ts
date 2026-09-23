export interface TranscriptWord { text: string; start: number; end: number }
export interface TextWord extends TranscriptWord { from: number; to: number }

export type ConversationWord = {
  start: number;
  end: number;
  trackId: string;
  text?: string;
};

export type ConversationTurn = {
  indices: number[];
  start: number;
  end: number;
};

/** whisper.cpp -ml 1 -sow emits word segments with millisecond offsets. */
export function parseTranscript(value: unknown, duration: number): TranscriptWord[] {
  if (!value || typeof value !== "object" || !Number.isFinite(duration) || duration <= 0) return [];
  const segments = (value as { transcription?: unknown }).transcription;
  if (!Array.isArray(segments)) return [];
  const words: TranscriptWord[] = [];
  for (const segment of segments) {
    if (!segment || typeof segment.text !== "string") continue;
    const text = segment.text.trim();
    const from = segment.offsets?.from, to = segment.offsets?.to;
    if (!text || /^\[.*\]$/.test(text) || typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const start = from / 1000, end = Math.min(to / 1000, duration);
    if (start < 0 || end <= start || start >= duration || (words.length && start < words[words.length - 1].start)) continue;
    // Punctuation-only segments belong to the preceding word.
    if (/^[^\p{L}\p{N}]+$/u.test(text) && words.length) {
      words[words.length - 1].text += text;
      words[words.length - 1].end = Math.max(words[words.length - 1].end, end);
    } else words.push({ text, start, end });
  }
  return words;
}

export function selectedWordRange(words: TranscriptWord[], anchor: number, focus: number): { start: number; end: number } | null {
  const first = Math.min(anchor, focus), last = Math.max(anchor, focus);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= words.length) return null;
  return { start: words[first].start, end: words.slice(first, last + 1).reduce((end, word) => Math.max(end, word.end), words[first].end) };
}

function isGreeting(text: string | undefined): boolean {
  return /^hi,?$/i.test((text ?? "").trim());
}

function maxEnd(indices: number[], words: ConversationWord[]): number {
  return Math.max(...indices.map((index) => words[index].end));
}

function splitOnSilence(
  indices: number[],
  words: ConversationWord[],
  gap: number,
): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  for (const index of indices) {
    const previous = current.length ? words[current[current.length - 1]] : null;
    if (previous && words[index].start - previous.end > gap) {
      groups.push(current);
      current = [];
    }
    current.push(index);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Conversation turns from stored word clocks: opening greetings, then
 * same-speaker runs split on that track's silence gap.
 */
export function conversationParagraphs(
  words: ConversationWord[],
  minSilenceSec: (trackId: string) => number,
): ConversationTurn[] {
  const byTrack = new Map<string, number[]>();
  words.forEach((word, index) => {
    const list = byTrack.get(word.trackId);
    if (list) list.push(index);
    else byTrack.set(word.trackId, [index]);
  });
  const raw: { indices: number[] }[] = [];
  for (const [trackId, indices] of byTrack) {
    const gap = minSilenceSec(trackId);
    let rest = indices;
    if (rest.length && isGreeting(words[rest[0]].text)) {
      raw.push({ indices: [rest[0]] });
      rest = rest.slice(1);
    }
    for (const group of splitOnSilence(rest, words, gap))
      raw.push({ indices: group });
  }
  return raw
    .map((turn) => ({
      indices: turn.indices,
      start: words[turn.indices[0]].start,
      end: maxEnd(turn.indices, words),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export type ExportTranscriptLine = { clock: number; speaker: string; text: string };

/** Speaker turns for a transcript file: clock + name, then that run of words. */
export function formatExportTranscript(lines: ExportTranscriptLine[]): string {
  const sorted = [...lines].sort((a, b) => a.clock - b.clock);
  const blocks: { clock: number; speaker: string; words: string[] }[] = [];
  for (const line of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === line.speaker) last.words.push(line.text);
    else blocks.push({ clock: line.clock, speaker: line.speaker, words: [line.text] });
  }
  if (blocks.length === 0) return "";
  return blocks
    .map((block) => `${formatTranscriptClock(block.clock)} ${block.speaker}\n${block.words.join(" ")}`)
    .join("\n\n") + "\n";
}

export function formatTranscriptClock(seconds: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 10));
  const minutes = Math.floor(tenths / 600);
  const secs = Math.floor(tenths % 600 / 10);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths % 10}`;
}

/** Original recording clocks, with minutes allowed to exceed 59. */
export function parseTranscriptClock(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{2,}:[0-5]\d\.\d$/.test(value)) return null;
  const [minutes, seconds] = value.split(":");
  const result = Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(result) ? result : null;
}

export function formatParagraphClock(start: number, end: number): string {
  const from = formatTranscriptClock(start);
  const to = formatTranscriptClock(end);
  return from === to ? from : `${from}–${to}`;
}

/** Word indices in on-screen paragraph order between two conversation words. */
export function visualWordRange(
  paragraphs: number[][],
  anchor: number,
  focus: number,
): number[] {
  const order = paragraphs.flat();
  const from = order.indexOf(anchor);
  const to = order.indexOf(focus);
  if (from < 0 || to < 0) {
    const first = Math.min(anchor, focus);
    const last = Math.max(anchor, focus);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }
  const first = Math.min(from, to);
  const last = Math.max(from, to);
  return order.slice(first, last + 1);
}

/** Native text ranges are half-open; touching the next word does not select it. */
export function wordsAtOffsets(words: TextWord[], anchor: number, focus: number): [number, number] | null {
  const start = Math.min(anchor, focus), end = Math.max(anchor, focus);
  if (start === end) return null;
  const first = words.findIndex(w => w.to > start && w.from < end);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < words.length && words[last + 1].from < end) last++;
  return [first, last];
}

/** Word indices whose joined text contains `query` as a literal, case-insensitive phrase. */
export function transcriptFindHits(texts: string[], query: string): number[] {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!needle) return [];
  const parts = texts.map((text) => text.toLowerCase());
  const haystack = parts.join(" ");
  const hits = new Set<number>();
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const end = at + needle.length;
    let pos = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) pos += 1;
      const start = pos;
      pos += parts[i].length;
      if (start < end && pos > at) hits.add(i);
    }
    from = at + 1;
  }
  return [...hits].sort((a, b) => a - b);
}
