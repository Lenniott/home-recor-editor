/**
 * Canvas can't read CSS custom properties, so the waveform's palette is
 * defined once here and mirrored as custom properties in `app.css` for
 * the surrounding chrome (buttons, sliders, readouts).
 */
export const theme = {
  panel: "#1b2028",
  cream: "#e8edf4",
  amber: "#8bb8ee",
  /** Fill + hatch stroke for marked (silence) regions — teal, not another shade of black, so they read as a distinct state rather than a dim waveform. */
  markedFill: "rgba(63, 167, 154, 0.30)",
  markedHatch: "rgba(63, 167, 154, 0.65)",
  markedBorder: "rgba(63, 167, 154, 0.9)",
  /** Dashed hint at the raw (pre-buffer) VAD-detected extent — the fill itself only covers the buffer-adjusted, conservative "safe to cut" zone. */
  markedRawExtent: "rgba(63, 167, 154, 0.45)",
  /** Collapsed-gutter fill/border for hidden *unmarked* audio (view filter set to "hide unmarked") — neutral, since teal is reserved for marked content. */
  gutterFill: "rgba(242, 230, 208, 0.05)",
  gutterBorder: "rgba(242, 230, 208, 0.35)",
  outsideShade: "rgba(0, 0, 0, 0.45)",
  /** Pending drag-to-select range, before Mark/Unmark is applied. */
  selectionFill: "rgba(242, 230, 208, 0.22)",
  selectionBorder: "rgba(242, 230, 208, 0.9)",
  /** Shared cuts: time removed from every track at once. Red, since unlike a silence it takes the timeline with it. */
  cutFill: "rgba(209, 73, 91, 0.28)",
  cutBorder: "rgba(209, 73, 91, 0.9)",
  /** A cut suggestion — proposed, not applied, so it's drawn as an outline rather than a solid band. */
  suggestionFill: "rgba(226, 163, 60, 0.18)",
  suggestionBorder: "rgba(226, 163, 60, 0.85)",
  in: "#d1495b",
  out: "#3fa79a",
  grid: "rgba(242, 230, 208, 0.08)",
} as const;
