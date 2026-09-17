/** Progress phases native and frontend both emit or consume. Unknown names are ignored. */
export const TRANSCRIPTION_PROGRESS_PHASES = [
  "downloading",
  "verifying",
  "detecting",
  "transcribing",
  "transcribing-cpu",
  "complete",
  "error",
  "cancelled",
] as const;

export type TranscriptionProgressPhase = (typeof TRANSCRIPTION_PROGRESS_PHASES)[number];

const known = new Set<string>(TRANSCRIPTION_PROGRESS_PHASES);

export function isTranscriptionProgressPhase(phase: string): phase is TranscriptionProgressPhase {
  return known.has(phase);
}
