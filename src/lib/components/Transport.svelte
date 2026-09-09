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
  <button
    type="button"
    class="preview"
    class:on={editor.preview === "edited"}
    aria-pressed={editor.preview === "edited"}
    title="Hear the project with silences muted and cuts removed"
    onclick={() => {
      editor.setPreview(editor.preview === "edited" ? "original" : "edited");
      player.refreshIfPlaying();
    }}
  >
    Preview edits
    <span class="switch" aria-hidden="true"></span>
  </button>

  <!-- Edited time: the cuts are taken out of both numbers, so this counts what you actually hear. -->
  <div class="time" title="Position and length with the shared cuts removed">
    <span class="current">{formatTime(editor.playheadKeptSec)}</span>
    <span class="sep">/</span>
    <span class="duration">{formatTime(editor.displayKeptDuration)}</span>
  </div>

  <button
    class="play"
    onclick={() => player.toggle()}
    disabled={!editor.hasAudio}
  >
    {editor.isPlaying ? "Pause" : "Play"}
  </button>
</div>

<style>
  .preview {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border-color: transparent;
    color: var(--cream-dim);
    padding: 0.35rem 0.15rem;
  }
  .preview:hover:not(:disabled) {
    background: transparent;
    border-color: transparent;
    color: var(--cream);
  }
  .preview.on {
    color: var(--cream);
  }
  .switch {
    position: relative;
    width: 1.7rem;
    height: 0.95rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--chassis);
    border: 1px solid var(--panel-line);
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 1px;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--cream-dim);
    transition:
      left 0.15s,
      background 0.15s;
  }
  .preview.on .switch {
    background: var(--amber);
    border-color: var(--amber);
  }
  .preview.on .switch::after {
    left: calc(100% - 0.7rem - 1px);
    background: var(--chassis);
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 0.75rem;
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

  @media (max-width: 950px) {
    .transport {
      gap: 0.5rem;
      flex-wrap: nowrap;
    }
    .transport button {
      padding: 0.4rem 0.5rem;
      font-size: 0.7rem;
    }
    .preview {
      padding: 0.25rem 0.1rem;
    }
    .play {
      min-width: 4rem;
    }
    .time {
      font-size: 0.8rem;
      white-space: nowrap;
    }
  }
</style>
