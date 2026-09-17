/** Shared Silero positive→negative threshold rule for detection and transcription. */
export function sileroThresholds(positive: number): { positive: number; negative: number } {
  return { positive, negative: Math.max(0, positive - 0.15) };
}

/** Option object both cleanup detection and transcription pass to `vadDetector.detect`. */
export function vadDetectOptions(positive: number) {
  const { positive: p, negative } = sileroThresholds(positive);
  return { positiveSpeechThreshold: p, negativeSpeechThreshold: negative };
}
