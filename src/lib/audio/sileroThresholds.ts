/** Shared Silero positive→negative threshold rule for detection and transcription. */
export function sileroThresholds(positive: number): { positive: number; negative: number } {
  return { positive, negative: Math.max(0, positive - 0.15) };
}
