export interface TranscriptWord { text: string; start: number; end: number }
export interface TextWord extends TranscriptWord { from: number; to: number }

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
