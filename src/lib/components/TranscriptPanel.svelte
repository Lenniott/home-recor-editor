<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { editor } from "$lib/editor.svelte";
  import { player } from "$lib/player";
  import { fitWindow } from "$lib/audio/markerNav";
  import { Transcription } from "$lib/transcription.svelte";
  import { selectedWordRange, wordsAtOffsets } from "$lib/transcript";

  const transcript = new Transcription();
  let expanded = $state(false);
  let root: HTMLDivElement = $state()!;
  let anchor = 0;
  let focus = 0;
  let dragging = false;
  let pointerStart = { x: 0, y: 0 };
  let pointerMoved = false;
  let nativeSelectionOwned = false;
  let pointerInTranscript = false;
  let suppressNativeSelection = false;
  const currentWord = $derived.by(() => {
    const words = transcript.words;
    const time = editor.playheadSec;
    // Playback ticks at animation-frame frequency; locate the word without scanning the transcript.
    let low = 0, high = words.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (words[mid].start <= time) low = mid + 1;
      else high = mid;
    }
    const index = low - 1;
    return index >= 0 && time < words[index].end ? index : -1;
  });
  const markedWords = $derived.by(() => {
    const regions = editor.markedIntervals;
    let region = 0;
    return transcript.words.map(word => {
      while (region < regions.length && regions[region].end <= word.start) region++;
      return region < regions.length && regions[region].start < word.end;
    });
  });
  const paragraphs = $derived.by(() => {
    const groups: number[][] = [];
    transcript.words.forEach((word, index) => {
      const previous = transcript.words[index - 1];
      if (!previous || word.start - previous.end > 1.2 || groups[groups.length - 1].length >= 60) groups.push([]);
      groups[groups.length - 1].push(index);
    });
    return groups;
  });

  onMount(() => { void transcript.init(); return () => transcript.dispose(); });
  $effect(() => {
    const audio = editor.audioBuffer;
    untrack(() => { transcript.setAudio(audio); anchor = 0; focus = 0; nativeSelectionOwned = false; });
  });
  // Seed the job runner from a transcript the project just loaded (see
  // `editor.applyProjectV2`/`applyLegacyProject`). Keyed to
  // `transcriptRestoreToken` rather than `transcriptWords`/`transcriptStatus`
  // directly, so this fires exactly once per project load instead of also
  // re-firing off its own mirrored writes below.
  let restoredToken = -1;
  $effect(() => {
    const token = editor.transcriptRestoreToken;
    untrack(() => {
      if (token === restoredToken) return;
      restoredToken = token;
      if (editor.transcriptStatus === "complete") transcript.restore(editor.transcriptWords, true);
    });
  });
  // Mirror a freshly completed (or just-restored) transcript back into the
  // project so it round-trips through save/autosave — see `editor.setTranscript`.
  $effect(() => {
    const completed = transcript.completed;
    const words = transcript.words;
    untrack(() => { if (completed) editor.setTranscript(words, "complete"); });
  });
  $effect(() => {
    const index = currentWord;
    if (expanded && editor.isPlaying && index >= 0) {
      untrack(() => {
        // Keep the spoken word visible without moving the text under a drag or edit selection.
        if (dragging || editor.hasSelection || !root) return;
        const word = root.querySelector<HTMLElement>(`[data-word="${index}"]`);
        if (!word) return;
        const bounds = root.getBoundingClientRect(), box = word.getBoundingClientRect();
        if (box.top < bounds.top || box.bottom > bounds.bottom) {
          root.scrollTop += box.top - bounds.top - root.clientHeight / 2;
        }
      });
    }
  });

  function select(first: number, last: number, reveal = true, seek = false): void {
    const range = selectedWordRange(transcript.words, first, last);
    if (!range) return;
    anchor = first;
    focus = last;
    const filterChanged = editor.viewFilter !== "all";
    editor.withoutHistory(() => {
      if (editor.viewFilter !== "all") editor.setViewFilter("all");
      editor.setSelection(range.start, range.end);
      if (reveal) {
        const view = fitWindow(range, editor.durationSec);
        editor.setView(view.startSec, view.durationSec);
      }
    });
    if (seek) player.seek(transcript.words[last].start);
    else if (filterChanged) player.refreshIfPlaying();
  }

  function textOffset(node: Node, offset: number): number {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function readNativeSelection(reveal = false): boolean {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode ||
      !root?.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return false;
    // Walk the DOM once: prefix ranges per word become quadratic on long recordings.
    const offsets = transcript.words.map(word => ({ ...word, from: 0, to: 0 }));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      const span = node.parentElement?.closest<HTMLElement>("[data-word]");
      if (span) {
        const index = Number(span.dataset.word);
        offsets[index].from = position;
        offsets[index].to = position + length;
      }
      position += length;
    }
    const anchorOffset = textOffset(selection.anchorNode, selection.anchorOffset);
    const focusOffset = textOffset(selection.focusNode, selection.focusOffset);
    const range = wordsAtOffsets(offsets, anchorOffset, focusOffset);
    if (!range) return false;
    nativeSelectionOwned = true;
    const [first, last] = anchorOffset <= focusOffset ? range : [range[1], range[0]];
    select(first, last, reveal);
    return true;
  }

  function selectionChange(): void {
    if (!expanded || suppressNativeSelection) return;
    if (readNativeSelection()) return;
    // Toolbar focus can collapse the browser selection before its Mark click runs.
    // Keep that pending audio range; only a collapse inside the transcript clears it.
    if (nativeSelectionOwned && pointerInTranscript) {
      nativeSelectionOwned = false;
      editor.clearSelection();
    }
  }

  function clearNativeSelection(): void {
    nativeSelectionOwned = false;
    window.getSelection()?.removeAllRanges();
  }

  function pointerDown(event: PointerEvent): void {
    if (event.button > 0) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerMoved = false;
    pointerInTranscript = !!root?.contains(event.target as Node);
    dragging = pointerInTranscript;
    suppressNativeSelection = !pointerInTranscript;
  }

  function pointerMove(event: PointerEvent): void {
    if (dragging && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 3) pointerMoved = true;
  }

  function pointerUp(event: PointerEvent): void {
    if (event.button > 0) return;
    pointerMove(event);
    const wasDragging = dragging;
    dragging = false;
    if (!expanded) return;
    const inside = event.target instanceof Node && root?.contains(event.target);
    if (!inside && !wasDragging) return;
    // A plain click wins even if the browser has not collapsed the previous native range yet.
    const plainClick = wasDragging && !pointerMoved;
    if (!plainClick && readNativeSelection(true)) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-word]") : null;
    if (target && root?.contains(target)) {
      const index = Number(target.dataset.word);
      clearNativeSelection();
      select(event.shiftKey ? anchor : index, index, true, !event.shiftKey);
      root.focus({ preventScroll: true });
    } else if (inside) {
      clearNativeSelection();
      editor.clearSelection();
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (!transcript.words.length || event.metaKey || event.ctrlKey || event.altKey) return;
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(focus + 1, transcript.words.length - 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(focus - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = transcript.words.length - 1;
    else if (event.key === "Enter") next = focus;
    else return;
    event.preventDefault();
    suppressNativeSelection = false;
    clearNativeSelection();
    select(event.shiftKey ? anchor : next, next, true, !event.shiftKey);
    root.querySelector(`[data-word="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function mark(): void { clearNativeSelection(); editor.toggleSelectionMark(); player.refreshIfPlaying(); }
  function selected(start: number, end: number): boolean {
    if (editor.selectionStartSec === null || editor.selectionEndSec === null) return false;
    return start < Math.max(editor.selectionStartSec, editor.selectionEndSec) && end > Math.min(editor.selectionStartSec, editor.selectionEndSec);
  }
</script>

<svelte:window onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => { dragging = false; }} />
<svelte:document onselectionchange={selectionChange} />

<section class="transcript-panel" aria-label="Edit by text">
  <button class="heading" aria-expanded={expanded} aria-controls="transcript-body" onclick={() => expanded = !expanded}>
    <span>{expanded ? "▾" : "▸"} Edit by text</span>
    <span class="subtitle">{transcript.busy ? "Working…" : "Local English transcript"}</span>
  </button>
  <div id="transcript-body" hidden={!expanded}>
    <div class="actions">
      {#if !transcript.modelChecked}
        <span>Checking speech model…</span>
      {:else if !transcript.connected}
        <button onclick={() => transcript.init()}>Retry connection</button>
      {:else if !transcript.modelReady}
        <button onclick={() => transcript.download()} disabled={transcript.busy}>Download English model · 142 MB</button>
      {:else}
        <button onclick={() => transcript.transcribe()} disabled={!editor.hasAudio || transcript.busy}>
          {transcript.completed || transcript.invalidated ? "Transcribe again" : "Transcribe"}
        </button>
      {/if}
      {#if transcript.error && transcript.modelReady && !transcript.busy}
        <button onclick={() => transcript.download()}>Download model again</button>
      {/if}
      {#if transcript.busy}
        <progress max="100" value={transcript.percent ?? undefined} aria-label="Transcription progress"></progress>
        <span role="status">{({ preparing: "Preparing audio…", downloading: "Downloading model…", verifying: "Checking download…", transcribing: "Transcribing…", cancelling: "Cancelling…" } as Record<string, string>)[transcript.phase]}{transcript.percent !== null ? ` ${Math.round(transcript.percent)}%` : ""}</span>
        <button onclick={() => transcript.cancel()} disabled={transcript.phase === "cancelling"}>Cancel</button>
      {/if}
      {#if transcript.words.length && editor.hasSelection}
        <button onclick={mark}>{editor.selectionOverlap === "marked" ? "Unmark" : "Mark"} selection <kbd>M</kbd></button>
        {#if editor.selectionOverlap === "mixed"}
          <button onclick={() => { clearNativeSelection(); editor.unmarkSelection(); player.refreshIfPlaying(); }}>Unmark selection</button>
        {/if}
        <button onclick={() => { clearNativeSelection(); editor.clearSelection(); }}>Clear</button>
      {/if}
    </div>
    {#if transcript.error}<p class="error" role="alert">{transcript.error} Use the button above to retry.</p>{/if}
    {#if !editor.hasAudio}
      <p>Open a recording to edit its audio by selecting words.</p>
    {:else if transcript.words.length}
      <p id="transcript-help" class="hint">Click a word to move the playhead. Drag to select audio, then mark it. Arrow keys move by word; Shift extends selection. Timings are approximate—adjust edges in the waveform.</p>
      <div class="words" bind:this={root} tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label="Transcript" aria-describedby="transcript-help" onkeydown={keydown}>
        {#each paragraphs as paragraph}
          <p>{#each paragraph as index}<span data-word={index} aria-current={currentWord === index ? "true" : undefined} class:current={currentWord === index} class:selected={selected(transcript.words[index].start, transcript.words[index].end)} class:marked={markedWords[index]}>{transcript.words[index].text}</span>{" "}{/each}</p>
        {/each}
      </div>
    {:else if !transcript.busy}
      <p>{transcript.completed ? "No speech found. Try another recording or transcribe again." : transcript.invalidated ? "The audio changed. Transcribe again to get updated word timings." : "Generate a transcript, then select words to highlight their audio range."}</p>
    {/if}
    <p class="hint privacy">Audio stays on this Mac. Transcripts and marks are saved with your project.</p>
  </div>
</section>

<style>
  .transcript-panel { flex: 0 0 auto; min-height: 0; border: 1px solid var(--panel-line); border-radius: 6px; background: var(--panel); }
  .heading { width: 100%; display: flex; justify-content: space-between; align-items: center; border: 0; background: transparent; padding: 0.65rem 1rem; text-align: left; }
  .subtitle, .hint { color: var(--cream-dim); font-size: 0.75rem; }
  #transcript-body { padding: 0 1rem 0.65rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; font-size: 0.8rem; padding-top: 0.35rem; }
  p { font-size: 0.85rem; margin: 0.65rem 0; }
  .words { max-height: min(28vh, 260px); min-height: 70px; overflow: auto; user-select: text; -webkit-user-select: text; cursor: text; border-top: 1px solid var(--panel-line); padding: 0.3rem 0.15rem; }
  .words p { line-height: 1.9; font-size: 0.95rem; }
  .words span { border-radius: 2px; }
  .words span.marked { background: #24574e; text-decoration: underline; text-decoration-color: var(--out-color); }
  .words span.selected { background: var(--cream); color: var(--chassis); }
  .words span.current { box-shadow: inset 0 -3px var(--amber); color: var(--amber); }
  .words span.selected.current { color: var(--chassis); }
  .words ::selection { background: var(--amber); color: var(--chassis); }
  .words:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  .error { color: var(--in-color); white-space: pre-wrap; max-height: 5rem; overflow: auto; }
  .privacy { margin-bottom: 0; }
  progress { width: 5rem; accent-color: var(--amber); }
  kbd { opacity: 0.65; margin-left: 0.3rem; }
</style>
