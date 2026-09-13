import type { TranscriptWord } from "../transcript";

export interface SpeechSpan { start: number; end: number }
export interface SpeechWindow extends SpeechSpan { offset: number }

/** Padded speech only, on the 16 kHz transcription frame grid. */
export function speechWindows(segments: SpeechSpan[], duration: number, padding = .2): SpeechWindow[] {
  const ranges = segments.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .map(s => ({start: Math.max(0, Math.floor((s.start-padding)*16000)/16000), end: Math.min(duration, Math.ceil((s.end+padding)*16000)/16000)}))
    .filter(s => s.end > s.start).sort((a,b) => a.start-b.start);
  const merged: SpeechSpan[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end,range.end);
    else merged.push({...range});
  }
  let offset = 0;
  return merged.map(range => { const window = {...range,offset}; offset += range.end-range.start; return window; });
}

/** A word crossing a join is clamped to its starting window, never stretched across a removed pause. */
export function restoreSpeechTimes(words: TranscriptWord[], windows: SpeechWindow[], speech: SpeechSpan[]): TranscriptWord[] {
  return words.flatMap(word => {
    const window = windows.find(s => word.start >= s.offset && word.start < s.offset+s.end-s.start);
    if (!window) return [];
    const start = window.start+word.start-window.offset;
    const end = Math.min(window.end, window.start+word.end-window.offset);
    if (end <= start || !speech.some(s => s.start < end && s.end > start)) return [];
    return [{...word,start,end}];
  });
}
