<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import { computePeaksRange, type PeakColumns } from "../audio/peaks";
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

  type DragTarget =
    | { type: "in" }
    | { type: "out" }
    | { type: "silence"; index: number; edge: "start" | "end" }
    | { type: "select"; anchorSec: number; startX: number; moved: boolean };

  let drag: DragTarget | null = null;

  function timeToX(t: number): number {
    if (editor.viewDurationSec <= 0) return 0;
    return ((t - editor.viewStartSec) / editor.viewDurationSec) * width;
  }

  function xToTime(x: number): number {
    if (width <= 0) return editor.viewStartSec;
    return editor.viewStartSec + (x / width) * editor.viewDurationSec;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function hitTest(x: number): DragTarget | null {
    if (Math.abs(x - timeToX(editor.inSec)) <= HIT_RADIUS) return { type: "in" };
    if (Math.abs(x - timeToX(editor.outSec)) <= HIT_RADIUS) return { type: "out" };
    for (let i = 0; i < editor.silenceRegions.length; i++) {
      const displayed = editor.silenceRegions[i].displayed;
      if (!displayed) continue;
      if (Math.abs(x - timeToX(displayed.start)) <= HIT_RADIUS) return { type: "silence", index: i, edge: "start" };
      if (Math.abs(x - timeToX(displayed.end)) <= HIT_RADIUS) return { type: "silence", index: i, edge: "end" };
    }
    return null;
  }

  // Peaks only depend on the visible sample range and column count, not on
  // playhead/in/out/selection — cache them so a playhead tick during
  // playback doesn't re-scan the whole visible waveform every frame.
  let peaksCache: PeakColumns | null = null;
  let peaksCacheKey = "";

  function getPeaks(startSample: number, endSample: number, columns: number): PeakColumns {
    const key = `${startSample}:${endSample}:${columns}:${editor.monoSamples.length}`;
    if (peaksCache && peaksCacheKey === key) return peaksCache;
    peaksCache = computePeaksRange(editor.monoSamples, startSample, endSample, columns);
    peaksCacheKey = key;
    return peaksCache;
  }

  function drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.stroke();
  }

  function drawWaveform(ctx: CanvasRenderingContext2D): void {
    const centerY = height / 2;
    const halfHeight = height / 2 - 6;

    const startSample = Math.max(0, Math.floor(editor.viewStartSec * editor.sampleRate));
    const endSample = Math.min(
      editor.monoSamples.length,
      Math.ceil((editor.viewStartSec + editor.viewDurationSec) * editor.sampleRate),
    );
    const columns = Math.max(1, Math.round(width));
    const { min, max } = getPeaks(startSample, endSample, columns);

    ctx.fillStyle = theme.amber;
    for (let col = 0; col < columns; col++) {
      const yTop = centerY - max[col] * halfHeight;
      const yBottom = centerY - min[col] * halfHeight;
      ctx.fillRect(col, Math.min(yTop, yBottom), 1, Math.max(1, Math.abs(yBottom - yTop)));
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
   */
  function drawSilenceRegions(ctx: CanvasRenderingContext2D): void {
    for (const region of editor.silenceRegions) {
      if (!region.displayed) continue;

      const rawStartX = timeToX(region.raw.start);
      const rawEndX = timeToX(region.raw.end);
      const safeStartX = timeToX(region.displayed.start);
      const safeEndX = timeToX(region.displayed.end);

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

      const bandWidth = safeEndX - safeStartX;
      if (bandWidth <= 0) continue;

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

      drawTick(ctx, safeStartX);
      drawTick(ctx, safeEndX);
    }
  }

  function drawOutsideShade(ctx: CanvasRenderingContext2D): void {
    const inX = timeToX(editor.inSec);
    const outX = timeToX(editor.outSec);
    ctx.fillStyle = theme.outsideShade;
    if (inX > 0) ctx.fillRect(0, 0, Math.min(inX, width), height);
    if (outX < width) ctx.fillRect(Math.max(outX, 0), 0, width - Math.max(outX, 0), height);
  }

  /** The pending drag-to-select range, before Mark/Unmark is chosen. */
  function drawPendingSelection(ctx: CanvasRenderingContext2D): void {
    if (editor.selectionStartSec === null || editor.selectionEndSec === null) return;
    const startX = timeToX(Math.min(editor.selectionStartSec, editor.selectionEndSec));
    const endX = timeToX(Math.max(editor.selectionStartSec, editor.selectionEndSec));
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
    const x = timeToX(editor.playheadSec);
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
    drawSilenceRegions(ctx);
    drawOutsideShade(ctx);
    drawPendingSelection(ctx);
    drawFlag(ctx, timeToX(editor.inSec), theme.in, "right");
    drawFlag(ctx, timeToX(editor.outSec), theme.out, "left");
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
    drag = hitTest(e.offsetX) ?? { type: "select", anchorSec: xToTime(e.offsetX), startX: e.offsetX, moved: false };
    canvas?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || !editor.hasAudio) return;
    const t = xToTime(e.offsetX);
    if (drag.type === "in") editor.setIn(t);
    else if (drag.type === "out") editor.setOut(t);
    else if (drag.type === "silence") editor.moveSilenceMarker(drag.index, drag.edge, t);
    else {
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
      }
    } else if (drag?.type === "silence") {
      // Merge check happens only here, once, rather than on every
      // pointermove — see finishSilenceMarkerDrag for why.
      editor.finishSilenceMarkerDrag(drag.index);
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
      const anchorTime = xToTime(wheelAnchorX);
      const newDuration = clamp(editor.viewDurationSec * wheelZoomFactor, MIN_VIEW_DURATION_SEC, editor.durationSec || 1);
      const ratio = width > 0 ? wheelAnchorX / width : 0.5;
      editor.setView(anchorTime - ratio * newDuration, newDuration);
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
