<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import { computePeaksRange, type PeakColumns } from "../audio/peaks";
  import { keptToSource, sourceToKept, type TimelineSpan } from "../audio/timelineMap";
  import { theme } from "../theme";

  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined = $state();
  let width: number = $state(0);
  let height: number = $state(0);

  const HIT_RADIUS = 7;
  const FLAG_SIZE = 9;
  /** Pointer moves less than this many pixels while down still counts as a click (seek), not a drag-select. */
  const CLICK_THRESHOLD_PX = 4;
  const MIN_VIEW_DURATION_SEC = 0.2;
  /** exp(deltaY * ZOOM_SENSITIVITY): higher = more zoom per wheel notch. */
  const ZOOM_SENSITIVITY = 0.008;
  /** Pixel width reserved for a collapsed (hidden) span, so its two edge ticks stay apart and independently draggable. */
  const GUTTER_PX = 14;
  const MIN_GUTTER_PX = 3;
  /** However many gutters are visible at once, they never eat more than this fraction of the canvas. */
  const MAX_GUTTER_BUDGET_FRACTION = 0.5;
  const EPS = 1e-6;

  type DragTarget =
    | { type: "in" }
    | { type: "out" }
    | { type: "silence"; index: number; edge: "start" | "end" }
    | { type: "select"; anchorSec: number; startX: number; moved: boolean };

  let drag: DragTarget | null = null;

  /**
   * Pixel layout for the current view: kept seconds map to pixels at a
   * constant rate (`pps`), except each hidden span reserves a fixed
   * `gutterPx` slice regardless of its own (zero) kept width. That
   * reserved slice is what keeps a collapsed region's two edge ticks
   * apart on screen instead of stacked on the same pixel — hidden spans
   * collapse to a single point in kept-time (see `timelineMap.ts`), so
   * without a pixel-only reservation there'd be nothing to drag apart.
   */
  const layout = $derived.by(() => {
    const viewStart = editor.viewStartSec;
    const viewEnd = editor.viewStartSec + editor.viewDurationSec;
    const gutters = editor.timelineSpans
      .filter((span) => span.kind === "hidden" && span.keptStart >= viewStart - EPS && span.keptStart <= viewEnd + EPS)
      .map((span) => span.keptStart);

    const gutterPx =
      gutters.length > 0
        ? Math.max(MIN_GUTTER_PX, Math.min(GUTTER_PX, (width * MAX_GUTTER_BUDGET_FRACTION) / gutters.length))
        : GUTTER_PX;
    const reservedPx = gutters.length * gutterPx;
    const pixelsPerKeptSecond = editor.viewDurationSec > 0 ? Math.max(0, width - reservedPx) / editor.viewDurationSec : 0;

    return { viewStartKept: viewStart, pps: pixelsPerKeptSecond, gutterPx, gutters };
  });

  /** Kept seconds -> pixels. `side` picks which edge of a gutter to land on when `keptSec` lands exactly on a collapsed span's point. */
  function keptToX(keptSec: number, side: "start" | "end" = "start"): number {
    let cursorKept = layout.viewStartKept;
    let cursorX = 0;
    for (const g of layout.gutters) {
      if (keptSec < g - EPS) break;
      const gutterStartX = cursorX + (g - cursorKept) * layout.pps;
      if (Math.abs(keptSec - g) <= EPS) return side === "end" ? gutterStartX + layout.gutterPx : gutterStartX;
      cursorKept = g;
      cursorX = gutterStartX + layout.gutterPx;
    }
    return cursorX + (keptSec - cursorKept) * layout.pps;
  }

  /** Pixels -> kept seconds. A pixel inside a gutter's reserved slice snaps to that gutter's single collapsed point. */
  function xToKept(x: number): number {
    let cursorKept = layout.viewStartKept;
    let cursorX = 0;
    for (const g of layout.gutters) {
      const gutterStartX = cursorX + (g - cursorKept) * layout.pps;
      const gutterEndX = gutterStartX + layout.gutterPx;
      if (x < gutterStartX) return cursorKept + (x - cursorX) / (layout.pps || 1);
      if (x <= gutterEndX) return g;
      cursorKept = g;
      cursorX = gutterEndX;
    }
    return cursorKept + (x - cursorX) / (layout.pps || 1);
  }

  /** Source (file) seconds -> pixels, through the kept-time layout above. */
  function sourceTimeToX(t: number, side: "start" | "end" = "start"): number {
    return keptToX(sourceToKept(editor.timelineSpans, t), side);
  }

  function xToSourceTime(x: number): number {
    return keptToSource(editor.timelineSpans, xToKept(x));
  }

  /** Pixel bounds of a specific hidden span's own gutter (its keptStart === keptEnd, so "start"/"end" land on that gutter's own left/right edge). */
  function gutterPixelBounds(span: TimelineSpan): { startX: number; endX: number } {
    return { startX: keptToX(span.keptStart, "start"), endX: keptToX(span.keptStart, "end") };
  }

  /** Clicking inside a gutter feels like clicking the audio right after it, not into the hidden stretch that's the whole point of hiding. */
  function resolveClickSourceSec(x: number): number {
    for (let i = 0; i < editor.timelineSpans.length; i++) {
      const span = editor.timelineSpans[i];
      if (span.kind !== "hidden") continue;
      const { startX, endX } = gutterPixelBounds(span);
      if (x >= startX && x <= endX) {
        const next = editor.timelineSpans[i + 1];
        return next ? next.sourceStart : span.sourceEnd;
      }
    }
    return xToSourceTime(x);
  }

  function findHiddenSpanForRegion(index: number): TimelineSpan | undefined {
    const displayed = editor.silenceRegions[index]?.displayed;
    if (!displayed) return undefined;
    return editor.timelineSpans.find(
      (span) =>
        span.kind === "hidden" &&
        Math.abs(span.sourceStart - displayed.start) < EPS &&
        Math.abs(span.sourceEnd - displayed.end) < EPS,
    );
  }

  /**
   * Dragging a marked region's edge while it's collapsed into a gutter:
   * inside the gutter's own pixel slice, map linearly through the hidden
   * source interval so the edge can still be pulled in without switching
   * back to "view all". Once the pointer crosses into visible audio on
   * either side, fall through to the normal pixel mapping.
   */
  function resolveSilenceDragSourceSec(index: number, x: number): number {
    const hidden = findHiddenSpanForRegion(index);
    if (hidden) {
      const { startX, endX } = gutterPixelBounds(hidden);
      if (x >= startX && x <= endX) {
        const ratio = endX > startX ? (x - startX) / (endX - startX) : 0;
        return hidden.sourceStart + ratio * (hidden.sourceEnd - hidden.sourceStart);
      }
    }
    return xToSourceTime(x);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * IN's flag snaps to the far edge of a gutter it falls inside (where
   * playback would actually resume) and OUT's flag snaps to the near
   * edge (where the last audible content ends) — that way the flags
   * always sit where playback truly starts/stops instead of hovering
   * over hidden audio that's never heard.
   */
  function hitTest(x: number): DragTarget | null {
    if (Math.abs(x - sourceTimeToX(editor.inSec, "end")) <= HIT_RADIUS) return { type: "in" };
    if (Math.abs(x - sourceTimeToX(editor.outSec, "start")) <= HIT_RADIUS) return { type: "out" };
    for (let i = 0; i < editor.silenceRegions.length; i++) {
      const displayed = editor.silenceRegions[i].displayed;
      if (!displayed) continue;
      if (Math.abs(x - sourceTimeToX(displayed.start, "start")) <= HIT_RADIUS) return { type: "silence", index: i, edge: "start" };
      if (Math.abs(x - sourceTimeToX(displayed.end, "end")) <= HIT_RADIUS) return { type: "silence", index: i, edge: "end" };
    }
    return null;
  }

  // Peaks only depend on the visible spans and column layout, not on
  // playhead/in/out/selection — cache them so a playhead tick during
  // playback doesn't re-scan the visible waveform every frame. Cleared
  // whenever the view window or the spans it's cut into change.
  let peaksCache = new Map<string, PeakColumns>();
  let peaksCacheSignature = "";

  function getPeaks(startSample: number, endSample: number, columns: number): PeakColumns {
    const key = `${startSample}:${endSample}:${columns}`;
    const cached = peaksCache.get(key);
    if (cached) return cached;
    const peaks = computePeaksRange(editor.monoSamples, startSample, endSample, columns);
    peaksCache.set(key, peaks);
    return peaks;
  }

  function refreshPeaksCache(): void {
    let signature = `${editor.viewStartSec.toFixed(4)}:${editor.viewDurationSec.toFixed(4)}:${width}:${editor.monoSamples.length}`;
    for (const span of editor.timelineSpans) {
      signature += `|${span.kind === "keep" ? "k" : "h"}${span.sourceStart.toFixed(4)}-${span.sourceEnd.toFixed(4)}`;
    }
    if (signature === peaksCacheSignature) return;
    peaksCacheSignature = signature;
    peaksCache.clear();
  }

  function drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.stroke();
  }

  /** Draws each visible `keep` span's peaks in its own pixel slice; `hidden` spans are left blank here for `drawGutters` to fill in. */
  function drawWaveform(ctx: CanvasRenderingContext2D): void {
    refreshPeaksCache();

    const centerY = height / 2;
    const halfHeight = height / 2 - 6;
    const viewStart = editor.viewStartSec;
    const viewEnd = editor.viewStartSec + editor.viewDurationSec;

    ctx.fillStyle = theme.amber;
    for (const span of editor.timelineSpans) {
      if (span.kind !== "keep") continue;
      const clippedKeptStart = Math.max(span.keptStart, viewStart);
      const clippedKeptEnd = Math.min(span.keptEnd, viewEnd);
      if (clippedKeptEnd <= clippedKeptStart) continue;

      const startX = Math.max(0, Math.round(keptToX(clippedKeptStart)));
      const endX = Math.min(width, Math.round(keptToX(clippedKeptEnd)));
      const columns = endX - startX;
      if (columns <= 0) continue;

      // A keep span maps kept time to source time 1:1 with a fixed offset.
      const offset = span.sourceStart - span.keptStart;
      const startSample = Math.max(0, Math.floor((clippedKeptStart + offset) * editor.sampleRate));
      const endSample = Math.min(editor.monoSamples.length, Math.ceil((clippedKeptEnd + offset) * editor.sampleRate));
      const { min, max } = getPeaks(startSample, endSample, columns);

      for (let col = 0; col < columns; col++) {
        const yTop = centerY - max[col] * halfHeight;
        const yBottom = centerY - min[col] * halfHeight;
        ctx.fillRect(startX + col, Math.min(yTop, yBottom), 1, Math.max(1, Math.abs(yBottom - yTop)));
      }
    }
  }

  /** Collapsed spans render as a narrow band — teal when it's marked audio being hidden, neutral when it's unmarked audio being hidden. */
  function drawGutters(ctx: CanvasRenderingContext2D): void {
    const isMarkedHidden = editor.viewFilter === "hideMarked";
    for (const span of editor.timelineSpans) {
      if (span.kind !== "hidden") continue;
      const { startX, endX } = gutterPixelBounds(span);
      const clampedStart = Math.max(0, startX);
      const clampedEnd = Math.min(width, endX);
      const gutterWidth = clampedEnd - clampedStart;
      if (gutterWidth <= 0) continue;

      ctx.fillStyle = isMarkedHidden ? theme.markedFill : theme.gutterFill;
      ctx.fillRect(clampedStart, 0, gutterWidth, height);

      ctx.save();
      ctx.strokeStyle = isMarkedHidden ? theme.markedBorder : theme.gutterBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(clampedStart + 0.5, 0);
      ctx.lineTo(clampedStart + 0.5, height);
      ctx.moveTo(clampedEnd - 0.5, 0);
      ctx.lineTo(clampedEnd - 0.5, height);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTick(ctx: CanvasRenderingContext2D, x: number): void {
    ctx.strokeStyle = theme.cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = theme.cream;
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Marked (silence) bands get a teal fill + diagonal hatch + top/bottom
   * border, so they read as a distinct state rather than a dim version of
   * the waveform.
   *
   * The fill covers the buffer-adjusted `displayed` bounds, not the raw
   * VAD-detected bounds — the buffer's whole job is to hold back a margin
   * of silence next to speech so a cut doesn't land right on it, so the
   * highlight should show that smaller, conservative "safe to cut" zone.
   * A faint dashed line still marks the raw extent, so you can see how
   * much margin the buffer is giving up.
   *
   * When the view filter has collapsed a region into a gutter (drawn by
   * `drawGutters` instead), the band and raw-extent hint are skipped —
   * only the two edge ticks still draw, now spread across the gutter
   * instead of stacked on the same pixel.
   */
  function drawSilenceRegions(ctx: CanvasRenderingContext2D): void {
    const collapsed = editor.viewFilter === "hideMarked";

    for (const region of editor.silenceRegions) {
      if (!region.displayed) continue;

      if (!collapsed) {
        const rawStartX = sourceTimeToX(region.raw.start, "start");
        const rawEndX = sourceTimeToX(region.raw.end, "end");
        if (rawEndX - rawStartX > 0) {
          ctx.save();
          ctx.strokeStyle = theme.markedRawExtent;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(rawStartX + 0.5, 0);
          ctx.lineTo(rawStartX + 0.5, height);
          ctx.moveTo(rawEndX - 0.5, 0);
          ctx.lineTo(rawEndX - 0.5, height);
          ctx.stroke();
          ctx.restore();
        }

        const safeStartX = sourceTimeToX(region.displayed.start, "start");
        const safeEndX = sourceTimeToX(region.displayed.end, "end");
        const bandWidth = safeEndX - safeStartX;
        if (bandWidth > 0) {
          ctx.fillStyle = theme.markedFill;
          ctx.fillRect(safeStartX, 0, bandWidth, height);

          ctx.save();
          ctx.beginPath();
          ctx.rect(safeStartX, 0, bandWidth, height);
          ctx.clip();
          ctx.strokeStyle = theme.markedHatch;
          ctx.lineWidth = 1;
          const step = 10;
          for (let x = safeStartX - height; x < safeEndX + height; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + height, height);
            ctx.stroke();
          }
          ctx.restore();

          ctx.strokeStyle = theme.markedBorder;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(safeStartX, 1);
          ctx.lineTo(safeEndX, 1);
          ctx.moveTo(safeStartX, height - 1);
          ctx.lineTo(safeEndX, height - 1);
          ctx.stroke();
        }
      }

      drawTick(ctx, sourceTimeToX(region.displayed.start, "start"));
      drawTick(ctx, sourceTimeToX(region.displayed.end, "end"));
    }
  }

  function drawOutsideShade(ctx: CanvasRenderingContext2D): void {
    const inX = sourceTimeToX(editor.inSec, "end");
    const outX = sourceTimeToX(editor.outSec, "start");
    ctx.fillStyle = theme.outsideShade;
    if (inX > 0) ctx.fillRect(0, 0, Math.min(inX, width), height);
    if (outX < width) ctx.fillRect(Math.max(outX, 0), 0, width - Math.max(outX, 0), height);
  }

  /** The pending drag-to-select range, before Mark/Unmark is chosen. */
  function drawPendingSelection(ctx: CanvasRenderingContext2D): void {
    if (editor.selectionStartSec === null || editor.selectionEndSec === null) return;
    const startX = sourceTimeToX(Math.min(editor.selectionStartSec, editor.selectionEndSec), "start");
    const endX = sourceTimeToX(Math.max(editor.selectionStartSec, editor.selectionEndSec), "end");
    if (endX <= startX) return;

    ctx.fillStyle = theme.selectionFill;
    ctx.fillRect(startX, 0, endX - startX, height);
    ctx.strokeStyle = theme.selectionBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX + 0.75, 0.75, Math.max(0, endX - startX - 1.5), height - 1.5);
  }

  function drawFlag(ctx: CanvasRenderingContext2D, x: number, color: string, direction: "left" | "right"): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    if (direction === "right") {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + FLAG_SIZE, FLAG_SIZE * 0.6);
      ctx.lineTo(x, FLAG_SIZE * 1.2);
    } else {
      ctx.moveTo(x, 0);
      ctx.lineTo(x - FLAG_SIZE, FLAG_SIZE * 0.6);
      ctx.lineTo(x, FLAG_SIZE * 1.2);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayhead(ctx: CanvasRenderingContext2D): void {
    const x = sourceTimeToX(editor.playheadSec);
    ctx.save();
    ctx.strokeStyle = theme.cream;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = theme.cream;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(0, 0, width, height);

    if (!editor.hasAudio || width <= 0 || height <= 0) return;

    drawGrid(ctx);
    drawWaveform(ctx);
    drawGutters(ctx);
    drawSilenceRegions(ctx);
    drawOutsideShade(ctx);
    drawPendingSelection(ctx);
    drawFlag(ctx, sourceTimeToX(editor.inSec, "end"), theme.in, "right");
    drawFlag(ctx, sourceTimeToX(editor.outSec, "start"), theme.out, "left");
    drawPlayhead(ctx);
  }

  // Resize the canvas bitmap only when the element's pixel size actually
  // changes. Reallocating canvas.width/height (even to the same value)
  // forces the browser to throw away the backing bitmap, which was
  // happening on every zoom/pan/playhead tick before this was split out.
  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  });

  $effect(() => {
    // Reads below make this effect re-run whenever any of them change,
    // without touching the canvas bitmap itself.
    editor.monoSamples;
    editor.viewStartSec;
    editor.viewDurationSec;
    editor.viewFilter;
    editor.timelineSpans;
    editor.playheadSec;
    editor.inSec;
    editor.outSec;
    editor.silenceRegions;
    editor.selectionStartSec;
    editor.selectionEndSec;

    draw();
  });

  function onPointerDown(e: PointerEvent): void {
    if (!editor.hasAudio) return;
    drag = hitTest(e.offsetX) ?? { type: "select", anchorSec: resolveClickSourceSec(e.offsetX), startX: e.offsetX, moved: false };
    canvas?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || !editor.hasAudio) return;
    if (drag.type === "in") editor.setIn(xToSourceTime(e.offsetX));
    else if (drag.type === "out") editor.setOut(xToSourceTime(e.offsetX));
    else if (drag.type === "silence") {
      editor.moveSilenceMarker(drag.index, drag.edge, resolveSilenceDragSourceSec(drag.index, e.offsetX));
    } else {
      const t = xToSourceTime(e.offsetX);
      if (!drag.moved && Math.abs(e.offsetX - drag.startX) > CLICK_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) editor.setSelection(drag.anchorSec, t);
    }
  }

  function onPointerUp(): void {
    if (drag?.type === "select") {
      if (!drag.moved) {
        // Never moved past the click threshold: it's just a click. Seek
        // there and drop any previously pending selection instead of
        // leaving a zero-width one behind.
        player.seek(drag.anchorSec);
        editor.clearSelection();
      } else {
        // A real drag: auto-merge into an existing marked region if the
        // overlap is substantial, otherwise leave it pending for Mark/Unmark.
        editor.finishSelectionDrag();
        player.refreshIfPlaying();
      }
    } else if (drag?.type === "silence") {
      // Merge check happens only here, once, rather than on every
      // pointermove — see finishSilenceMarkerDrag for why.
      editor.finishSilenceMarkerDrag(drag.index);
      player.refreshIfPlaying();
    }
    drag = null;
  }

  // Wheel events can fire faster than the display refreshes; batching them
  // into one setView per animation frame keeps a fast zoom/pan flick from
  // queuing up redundant state writes (and redraws) behind each other.
  let rafId: number | null = null;
  let wheelIsZoom = false;
  let wheelZoomFactor = 1;
  let wheelAnchorX = 0;
  let wheelPanDeltaSec = 0;

  function flushWheel(): void {
    if (wheelIsZoom) {
      const anchorKept = xToKept(wheelAnchorX);
      const newDuration = clamp(editor.viewDurationSec * wheelZoomFactor, MIN_VIEW_DURATION_SEC, editor.displayKeptDuration || 1);
      const ratio = width > 0 ? wheelAnchorX / width : 0.5;
      editor.setView(anchorKept - ratio * newDuration, newDuration);
      wheelZoomFactor = 1;
    } else {
      editor.setView(editor.viewStartSec + wheelPanDeltaSec, editor.viewDurationSec);
      wheelPanDeltaSec = 0;
    }
  }

  function scheduleWheelFlush(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      flushWheel();
    });
  }

  function onWheel(e: WheelEvent): void {
    if (!editor.hasAudio) return;
    e.preventDefault();

    const isZoom = e.ctrlKey || e.metaKey;
    if (isZoom !== wheelIsZoom && rafId !== null) {
      // Mode changed mid-batch (e.g. user let go of Ctrl): flush the
      // pending zoom/pan before starting to accumulate the other kind.
      cancelAnimationFrame(rafId);
      rafId = null;
      flushWheel();
    }
    wheelIsZoom = isZoom;

    if (isZoom) {
      wheelAnchorX = e.offsetX;
      wheelZoomFactor *= Math.exp(e.deltaY * ZOOM_SENSITIVITY);
    } else {
      wheelPanDeltaSec += (e.deltaX || e.deltaY) * (editor.viewDurationSec / Math.max(1, width));
    }
    scheduleWheelFlush();
  }
</script>

<div class="waveform" bind:this={container} bind:clientWidth={width} bind:clientHeight={height}>
  {#if editor.hasAudio}
    <canvas
      bind:this={canvas}
      style="width:{width}px;height:{height}px"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
    ></canvas>
  {:else}
    <div class="empty">
      <p>No recording loaded</p>
      <p class="hint">Open a recording to see its waveform.</p>
    </div>
  {/if}
</div>

<style>
  .waveform {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
    overflow: hidden;
  }

  canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }

  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--cream-dim);
  }

  .empty p {
    margin: 0;
    font-family: var(--font-label);
    letter-spacing: 0.04em;
  }

  .empty .hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }
</style>
