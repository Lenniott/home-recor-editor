/**
 * Pixel layout shared by everything drawn against the timeline — the
 * waveform lanes and the cut lane — so they line up column for column.
 *
 * Kept seconds map to pixels at a constant rate (`pps`), except each
 * hidden span (a shared cut, or whatever the view filter collapses)
 * reserves a fixed `gutterPx` slice regardless of its own zero kept
 * width. That reserved slice is what keeps a collapsed region's two edges
 * apart on screen instead of stacked on the same pixel — hidden spans
 * collapse to a single point in kept time (see `timelineMap.ts`), so
 * without a pixel-only reservation there'd be nothing to see or drag.
 */

import { sourceToKept, type TimelineSpan } from "./timelineMap";

/** Pixel width reserved for a collapsed (hidden) span. */
export const GUTTER_PX = 14;
const MIN_GUTTER_PX = 3;
/** However many gutters are visible at once, they never eat more than this fraction of the canvas. */
const MAX_GUTTER_BUDGET_FRACTION = 0.5;
const EPS = 1e-6;

/** Which side of a gutter a time exactly on a collapsed span's point should land on. */
export type Side = "start" | "end";

export interface LaneLayout {
  /** Pixels per kept second, outside the gutters. */
  pps: number;
  gutterPx: number;
  /** Kept-time positions of the collapsed spans visible in this window. */
  gutters: number[];
  keptToX(keptSec: number, side?: Side): number;
  xToKept(x: number): number;
  sourceToX(sourceSec: number, side?: Side): number;
  /** Pixel bounds of one hidden span's own gutter. */
  gutterBounds(span: TimelineSpan): { startX: number; endX: number };
}

export function laneLayout(
  spans: TimelineSpan[],
  viewStartSec: number,
  viewDurationSec: number,
  width: number,
): LaneLayout {
  const viewEnd = viewStartSec + viewDurationSec;
  const gutters = spans
    .filter((span) => span.kind === "hidden" && span.keptStart >= viewStartSec - EPS && span.keptStart <= viewEnd + EPS)
    .map((span) => span.keptStart);

  const gutterPx =
    gutters.length > 0
      ? Math.max(MIN_GUTTER_PX, Math.min(GUTTER_PX, (width * MAX_GUTTER_BUDGET_FRACTION) / gutters.length))
      : GUTTER_PX;
  const reservedPx = gutters.length * gutterPx;
  const pps = viewDurationSec > 0 ? Math.max(0, width - reservedPx) / viewDurationSec : 0;

  function keptToX(keptSec: number, side: Side = "start"): number {
    let cursorKept = viewStartSec;
    let cursorX = 0;
    for (const g of gutters) {
      if (keptSec < g - EPS) break;
      const gutterStartX = cursorX + (g - cursorKept) * pps;
      if (Math.abs(keptSec - g) <= EPS) return side === "end" ? gutterStartX + gutterPx : gutterStartX;
      cursorKept = g;
      cursorX = gutterStartX + gutterPx;
    }
    return cursorX + (keptSec - cursorKept) * pps;
  }

  function xToKept(x: number): number {
    let cursorKept = viewStartSec;
    let cursorX = 0;
    for (const g of gutters) {
      const gutterStartX = cursorX + (g - cursorKept) * pps;
      const gutterEndX = gutterStartX + gutterPx;
      if (x < gutterStartX) return cursorKept + (x - cursorX) / (pps || 1);
      if (x <= gutterEndX) return g;
      cursorKept = g;
      cursorX = gutterEndX;
    }
    return cursorKept + (x - cursorX) / (pps || 1);
  }

  return {
    pps,
    gutterPx,
    gutters,
    keptToX,
    xToKept,
    sourceToX: (sourceSec, side = "start") => keptToX(sourceToKept(spans, sourceSec), side),
    gutterBounds: (span) => ({ startX: keptToX(span.keptStart, "start"), endX: keptToX(span.keptStart, "end") }),
  };
}
