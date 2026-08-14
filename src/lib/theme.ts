/**
 * Canvas can't read CSS custom properties, so the waveform's palette is
 * defined once here and mirrored as custom properties in `app.css` for
 * the surrounding chrome (buttons, sliders, readouts).
 */
export const theme = {
  panel: "#241f1a",
  cream: "#f2e6d0",
  amber: "#e2a33c",
  silenceShade: "rgba(0, 0, 0, 0.38)",
  outsideShade: "rgba(0, 0, 0, 0.45)",
  in: "#d1495b",
  out: "#3fa79a",
  grid: "rgba(242, 230, 208, 0.08)",
} as const;
