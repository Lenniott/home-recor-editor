<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import { computePeaksRange } from "../audio/peaks";
  import { theme } from "../theme";

  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined = $state();
  let width: number = $state(0);
  let height: number = $state(0);

  const HIT_RADIUS = 7;
  const FLAG_SIZE = 9;

  type DragTarget =
    | { type: "in" }
    | { type: "out" }
    | { type: "silence"; index: number; edge: "start" | "end" }
    | { type: "scrub" };

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
    const { min, max } = computePeaksRange(editor.monoSamples, startSample, endSample, columns);

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

  function drawSilenceRegions(ctx: CanvasRenderingContext2D): void {
    for (const region of editor.silenceRegions) {
      if (!region.displayed) continue;

      const bandStartX = timeToX(region.raw.start);
      const bandEndX = timeToX(region.raw.end);
      ctx.fillStyle = theme.silenceShade;
      ctx.fillRect(bandStartX, 0, bandEndX - bandStartX, height);

      drawTick(ctx, timeToX(region.displayed.start));
      drawTick(ctx, timeToX(region.displayed.end));
    }
  }

  function drawOutsideShade(ctx: CanvasRenderingContext2D): void {
    const inX = timeToX(editor.inSec);
    const outX = timeToX(editor.outSec);
    ctx.fillStyle = theme.outsideShade;
    if (inX > 0) ctx.fillRect(0, 0, Math.min(inX, width), height);
    if (outX < width) ctx.fillRect(Math.max(outX, 0), 0, width - Math.max(outX, 0), height);
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
    drawFlag(ctx, timeToX(editor.inSec), theme.in, "right");
    drawFlag(ctx, timeToX(editor.outSec), theme.out, "left");
    drawPlayhead(ctx);
  }

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Reads below make this effect re-run whenever any of them change.
    editor.monoSamples;
    editor.viewStartSec;
    editor.viewDurationSec;
    editor.playheadSec;
    editor.inSec;
    editor.outSec;
    editor.silenceRegions;

    draw();
  });

  function onPointerDown(e: PointerEvent): void {
    if (!editor.hasAudio) return;
    drag = hitTest(e.offsetX) ?? { type: "scrub" };
    if (drag.type === "scrub") player.seek(xToTime(e.offsetX));
    canvas?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || !editor.hasAudio) return;
    const t = xToTime(e.offsetX);
    if (drag.type === "in") editor.setIn(t);
    else if (drag.type === "out") editor.setOut(t);
    else if (drag.type === "silence") editor.moveSilenceMarker(drag.index, drag.edge, t);
    else player.seek(t);
  }

  function onPointerUp(): void {
    drag = null;
  }

  function onWheel(e: WheelEvent): void {
    if (!editor.hasAudio) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const anchorTime = xToTime(e.offsetX);
      const factor = Math.exp(e.deltaY * 0.002);
      const newDuration = clamp(editor.viewDurationSec * factor, 0.2, editor.durationSec || 1);
      const ratio = width > 0 ? e.offsetX / width : 0.5;
      editor.setView(anchorTime - ratio * newDuration, newDuration);
    } else {
      const deltaSec = (e.deltaX || e.deltaY) * (editor.viewDurationSec / Math.max(1, width));
      editor.setView(editor.viewStartSec + deltaSec, editor.viewDurationSec);
    }
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
