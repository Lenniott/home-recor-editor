<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
</script>

<div class="transport">
  <button class="play" onclick={() => player.toggle()} disabled={!editor.hasAudio}>
    {editor.isPlaying ? "Pause" : "Play"}
  </button>

  <!-- Edited time: the cuts are taken out of both numbers, so this counts what you actually hear. -->
  <div class="time" title="Position and length with the shared cuts removed">
    <span class="current">{formatTime(editor.playheadKeptSec)}</span>
    <span class="sep">/</span>
    <span class="duration">{formatTime(editor.displayKeptDuration)}</span>
  </div>

  <label class="loop">
    <input
      type="checkbox"
      checked={editor.loopInOut}
      onchange={(e) => editor.setLoopInOut((e.currentTarget as HTMLInputElement).checked)}
      disabled={!editor.hasAudio}
    />
    Loop IN&ndash;OUT
  </label>

  <div class="marker-readout in">
    <button onclick={() => player.seek(editor.inSec)} disabled={!editor.hasAudio}>IN</button>
    <span class="value">{formatTime(editor.inSec)}</span>
    <button
      class="set"
      onclick={() => editor.commitEdit(() => editor.setIn(editor.playheadSec))}
      disabled={!editor.hasAudio}
    >
      set
    </button>
  </div>

  <div class="marker-readout out">
    <button onclick={() => player.seek(editor.outSec)} disabled={!editor.hasAudio}>OUT</button>
    <span class="value">{formatTime(editor.outSec)}</span>
    <button
      class="set"
      onclick={() => editor.commitEdit(() => editor.setOut(editor.playheadSec))}
      disabled={!editor.hasAudio}
    >
      set
    </button>
  </div>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .play {
    min-width: 5rem;
  }

  .time {
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--amber);
    text-shadow: 0 0 6px rgba(226, 163, 60, 0.35);
    letter-spacing: 0.02em;
  }

  .sep {
    color: var(--cream-dim);
    margin: 0 0.35em;
  }

  .loop {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  .marker-readout {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .marker-readout button:first-child {
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    padding: 0.2rem 0.5rem;
  }

  .marker-readout.in button:first-child {
    color: var(--in-color);
    border-color: var(--in-color);
  }

  .marker-readout.out button:first-child {
    color: var(--out-color);
    border-color: var(--out-color);
  }

  .marker-readout .value {
    color: var(--cream);
    min-width: 5ch;
  }

  .marker-readout .set {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    opacity: 0.75;
  }
</style>
