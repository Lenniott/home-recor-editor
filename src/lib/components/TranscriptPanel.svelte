<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { editor, type TrackState } from "$lib/editor.svelte";
  import { player } from "$lib/player";
  import { fitWindow } from "$lib/audio/markerNav";
  import { Transcription } from "$lib/transcription.svelte";
  import { selectedWordRange, wordsAtOffsets } from "$lib/transcript";

  let { showSelectionActions = true }: { showSelectionActions?: boolean } =
    $props();
  const transcript = new Transcription();
  let expanded = $state(true);
  let queue: TrackState[] = [];
  let running: TrackState | null = $state(null);
  let runningAudio: AudioBuffer | null = null;
  const words = $derived(
    editor.tracks
      .flatMap((track) =>
        track.transcriptWords.map((word) => ({
          ...word,
          trackId: track.id,
          speaker: track.speaker,
        })),
      )
      .sort((a, b) => a.start - b.start || a.trackId.localeCompare(b.trackId)),
  );
  function nextTrack(): void {
    running = queue.shift() ?? null;
    if (!running || !editor.tracks.includes(running)) {
      running = null;
      queue = [];
      return;
    }
    runningAudio = running.audioBuffer;
    transcript.setAudio(runningAudio, running.monoSamples);
    void transcript.transcribe(running.settings);
  }
  function transcribeAll(): void {
    if (transcript.busy) return;
    queue = [...editor.tracks];
    nextTrack();
  }
  function cancelAll(): void {
    queue = [];
    void transcript.cancel();
  }
  transcript.onSettled = (result) => {
    if (
      result &&
      running &&
      editor.tracks.includes(running) &&
      running.audioBuffer === runningAudio
    ) {
      running.transcriptWords = result;
      running.transcriptStatus = "complete";
      editor.revision++;
    }
    if (!result) queue = [];
    nextTrack();
  };
  $effect(() => {
    const tracks = editor.tracks;
    if (running && !tracks.includes(running)) untrack(cancelAll);
  });
  let root: HTMLDivElement = $state()!;
  let anchor = 0;
  let focus = 0;
  let dragging = false;
  let pointerStart = { x: 0, y: 0 };
  let pointerMoved = false;
  let nativeSelectionOwned = false;
  let pointerInTranscript = false;
  let suppressNativeSelection = false;
  const wordsByTrack = $derived(
    editor.tracks.map((track) =>
      words.flatMap((word, index) =>
        word.trackId === track.id ? [{ word, index }] : [],
      ),
    ),
  );
  const currentWords = $derived.by(() => {
    const indices = new Set<number>();
    const time = editor.playheadSec;
    for (const entries of wordsByTrack) {
      let low = 0,
        high = entries.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (entries[mid].word.start <= time) low = mid + 1;
        else high = mid;
      }
      if (low > 0 && time < entries[low - 1].word.end)
        indices.add(entries[low - 1].index);
    }
    return indices;
  });
  const currentWord = $derived(currentWords.values().next().value ?? -1);
  const markedWords = $derived.by(() => {
    const marked = new Set<number>();
    editor.tracks.forEach((track, trackIndex) => {
      let region = 0;
      const ranges = track.markedIntervals;
      for (const { word, index } of wordsByTrack[trackIndex]) {
        while (region < ranges.length && ranges[region].end <= word.start)
          region++;
        if (region < ranges.length && ranges[region].start < word.end)
          marked.add(index);
      }
    });
    return marked;
  });
  const cutWords = $derived.by(() => {
    let region = 0;
    return words.map((word) => {
      while (
        region < editor.cuts.length &&
        editor.cuts[region].end <= word.start
      )
        region++;
      return (
        region < editor.cuts.length && editor.cuts[region].start < word.end
      );
    });
  });
  let previousCurrent = new Set<number>();
  $effect(() => {
    const active = currentWords;
    const container = root;
    if (!container) return;
    untrack(() => {
      for (const index of new Set([...previousCurrent, ...active])) {
        const element = container.querySelector<HTMLElement>(
          '[data-word="' + index + '"]',
        );
        element?.classList.toggle("current", active.has(index));
        if (active.has(index)) element?.setAttribute("aria-current", "true");
        else element?.removeAttribute("aria-current");
      }
      previousCurrent = active;
    });
  });
  const paragraphs = $derived.by(() => {
    const groups: number[][] = [];
    let spokenUntil = -Infinity;
    words.forEach((word, index) => {
      const previous = words[index - 1];
      if (
        !previous ||
        previous.trackId !== word.trackId ||
        word.start - spokenUntil >
          (editor.tracks.find((t) => t.id === word.trackId)?.settings
            .minSilenceMs ?? 1200) /
            1000
      )
        groups.push([]);
      groups[groups.length - 1].push(index);
      spokenUntil = Math.max(spokenUntil, word.end);
    });
    return groups;
  });

  onMount(() => {
    void transcript.init();
    return () => transcript.dispose();
  });
  $effect(() => {
    const index = currentWord;
    if (expanded && editor.isPlaying && index >= 0) {
      untrack(() => {
        // Keep the spoken word visible without moving the text under a drag or edit selection.
        if (dragging || editor.hasSelection || !root) return;
        const word = root.querySelector<HTMLElement>(`[data-word="${index}"]`);
        if (!word) return;
        const bounds = root.getBoundingClientRect(),
          box = word.getBoundingClientRect();
        if (box.top < bounds.top || box.bottom > bounds.bottom) {
          root.scrollTop += box.top - bounds.top - root.clientHeight / 2;
        }
      });
    }
  });

  function select(
    first: number,
    last: number,
    reveal = true,
    seek = false,
  ): void {
    const range = selectedWordRange(words, first, last);
    if (!range) return;
    anchor = first;
    focus = last;
    const filterChanged =
      editor.viewFilter !== "all" || editor.preview !== "original";
    editor.withoutHistory(() => {
      if (editor.viewFilter !== "all") editor.setViewFilter("all");
      editor.setPreview("original");
      const selectedWords = words.slice(
        Math.min(first, last),
        Math.max(first, last) + 1,
      );
      editor.selectTranscriptWords(selectedWords);
      if (seek) editor.setActiveTrack(words[last].trackId);
      if (reveal) {
        const view = fitWindow(range, editor.durationSec);
        editor.setView(view.startSec, view.durationSec);
      }
    });
    if (seek) player.seek(words[last].start);
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
    if (
      !selection ||
      selection.isCollapsed ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !root?.contains(selection.anchorNode) ||
      !root.contains(selection.focusNode)
    )
      return false;
    // Native selection endpoints usually sit inside words. Resolve these directly,
    // so dragging through a long recording never scans every transcript node.
    const native = selection.getRangeAt(0);
    const startSpan = (
      native.startContainer.nodeType === Node.ELEMENT_NODE
        ? (native.startContainer as Element)
        : native.startContainer.parentElement
    )?.closest<HTMLElement>("[data-word]");
    const endSpan = (
      native.endContainer.nodeType === Node.ELEMENT_NODE
        ? (native.endContainer as Element)
        : native.endContainer.parentElement
    )?.closest<HTMLElement>("[data-word]");
    if (startSpan && endSpan) {
      let first = Number(startSpan.dataset.word),
        last = Number(endSpan.dataset.word);
      const prefix = document.createRange();
      prefix.selectNodeContents(startSpan);
      prefix.setEnd(native.startContainer, native.startOffset);
      if (prefix.toString().length >= (startSpan.textContent?.length ?? 0))
        first++;
      prefix.selectNodeContents(endSpan);
      prefix.setEnd(native.endContainer, native.endOffset);
      if (prefix.toString().length === 0) last--;
      if (last < first) return false;
      nativeSelectionOwned = true;
      const forward =
        selection.anchorNode === native.startContainer &&
        selection.anchorOffset === native.startOffset;
      select(forward ? first : last, forward ? last : first, reveal);
      return true;
    }
    // Walk the DOM once: prefix ranges per word become quadratic on long recordings.
    const offsets = words.map((word) => ({ ...word, from: 0, to: 0 }));
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
    const anchorOffset = textOffset(
      selection.anchorNode,
      selection.anchorOffset,
    );
    const focusOffset = textOffset(selection.focusNode, selection.focusOffset);
    const range = wordsAtOffsets(offsets, anchorOffset, focusOffset);
    if (!range) return false;
    nativeSelectionOwned = true;
    const [first, last] =
      anchorOffset <= focusOffset ? range : [range[1], range[0]];
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
    if (
      dragging &&
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 3
    )
      pointerMoved = true;
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
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-word]")
        : null;
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
    if (!words.length || event.metaKey || event.ctrlKey || event.altKey) return;
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = Math.min(focus + 1, words.length - 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = Math.max(focus - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = words.length - 1;
    else if (event.key === "Enter") next = focus;
    else return;
    event.preventDefault();
    suppressNativeSelection = false;
    clearNativeSelection();
    select(event.shiftKey ? anchor : next, next, true, !event.shiftKey);
    root
      .querySelector(`[data-word="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function mark(): void {
    clearNativeSelection();
    editor.toggleSelectionMark();
    player.refreshIfPlaying();
  }
  function selected(start: number, end: number, trackId: string): boolean {
    if (editor.selectionStartSec === null || editor.selectionEndSec === null)
      return false;
    const range = editor.selectionRanges.find((r) => r.trackId === trackId);
    return !!range && start < range.end && end > range.start;
  }
</script>

<svelte:window
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={() => {
    dragging = false;
  }}
/>
<svelte:document onselectionchange={selectionChange} />

<section class="transcript-panel" aria-label="Edit by text">
  <div class="actions">
    {#if !transcript.modelChecked}
      <span>Checking speech model…</span>
    {:else if !transcript.connected}
      <button onclick={() => transcript.init()}>Retry connection</button>
    {:else if !transcript.modelReady}
      <button onclick={() => transcript.download()} disabled={transcript.busy}
        >Download English model · 142 MB</button
      >
    {:else}
      <button
        onclick={transcribeAll}
        disabled={!editor.hasAudio || transcript.busy}
      >
        {words.length ? "Transcribe all again" : "Transcribe all tracks"}
      </button>
    {/if}
    {#if transcript.error && transcript.modelReady && !transcript.busy}
      <button onclick={() => transcript.download()}>Download model again</button
      >
    {/if}
    {#if transcript.busy}
      <progress
        max="100"
        value={transcript.percent ?? undefined}
        aria-label="Transcription progress"
      ></progress>
      <span role="status"
        >{running ? running.speaker + " · " : ""}{(
          {
            detecting: "Checking speech…",
            preparing: "Preparing speech audio…",
            downloading: "Downloading model…",
            verifying: "Checking download…",
            transcribing: "Transcribing…",
            "transcribing-cpu": "Metal unavailable; transcribing on CPU…",
            cancelling: "Cancelling…",
          } as Record<string, string>
        )[transcript.phase]}{transcript.percent !== null
          ? ` ${Math.round(transcript.percent)}%`
          : ""}</span
      >
      <button onclick={cancelAll} disabled={transcript.phase === "cancelling"}
        >Cancel</button
      >
    {/if}
    {#if showSelectionActions && words.length && editor.hasSelection}
      <button onclick={mark}
        >{editor.selectionOverlap === "marked" ? "Unmark" : "Mark"} selection
        <kbd>M</kbd></button
      >
      {#if editor.selectionOverlap === "mixed"}
        <button
          onclick={() => {
            clearNativeSelection();
            editor.unmarkSelection();
            player.refreshIfPlaying();
          }}>Unmark selection</button
        >
      {/if}
      <button
        onclick={() => {
          clearNativeSelection();
          editor.clearSelection();
        }}>Clear</button
      >
    {/if}
  </div>
  {#if transcript.error}<p class="error" role="alert">
      {transcript.error} Use the button above to retry.
    </p>{/if}
  {#if !editor.hasAudio}
    <p>Open a recording to edit its audio by selecting words.</p>
  {:else if words.length}
    <div
      class="words"
      bind:this={root}
      tabindex="0"
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label="Transcript"
      aria-describedby="transcript-help"
      onkeydown={keydown}
    >
      {#each paragraphs as paragraph}
        <p>
          <strong class="speaker-label">{words[paragraph[0]].speaker}</strong
          >{#each paragraph as index}<span
              data-word={index}
              class:selected={editor.selectionTrackIds.includes(
                words[index].trackId,
              ) &&
                selected(
                  words[index].start,
                  words[index].end,
                  words[index].trackId,
                )}
              class:marked={markedWords.has(index)}
              class:cut={cutWords[index]}>{words[index].text}</span
            >{" "}{/each}
        </p>
      {/each}
    </div>
  {:else if !transcript.busy}
    <p>
      {transcript.completed
        ? "No speech found. Try another recording or transcribe again."
        : transcript.invalidated
          ? "The audio changed. Transcribe again to get updated word timings."
          : ""}
    </p>
  {/if}
</section>

<style>
  .transcript-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    flex: 1;
    min-height: 0;
    gap: 0.5rem;
  }
  .heading {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 0;
    background: transparent;
    padding: 0.65rem 1rem;
    text-align: left;
  }
  .subtitle,
  .hint {
    color: var(--cream-dim);
    font-size: 0.75rem;
  }
  #transcript-body:not([hidden]) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  #transcript-body {
    padding: 0 1rem 0.65rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.8rem;
  }
  p {
    font-size: 0.85rem;
    margin: 0.65rem 0;
  }
  .words {
    max-height: none;
    flex: 1;
    min-height: 70px;
    overflow: auto;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  .speaker-label {
    display: block;
    font-size: 0.72rem;
    color: var(--cream-dim);
    user-select: none;
  }
  .words p {
    line-height: 1.9;
    font-size: 0.95rem;
  }
  .words span {
    border-radius: 2px;
  }
  .words span.marked {
    background: #24574e;
    text-decoration: underline;
    text-decoration-color: var(--out-color);
  }
  .words span.cut {
    text-decoration: line-through;
    text-decoration-color: var(--in-color);
    opacity: 0.6;
  }
  .words span.selected {
    background: var(--cream);
    color: var(--chassis);
  }
  .words span:global(.current) {
    box-shadow: inset 0 -3px var(--amber);
    color: var(--amber);
  }
  .words span.selected:global(.current) {
    color: var(--chassis);
  }
  .words ::selection {
    background: var(--amber);
    color: var(--chassis);
  }
  .words:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 2px;
  }
  .error {
    color: var(--in-color);
    white-space: pre-wrap;
    max-height: 5rem;
    overflow: auto;
  }
  .privacy {
    margin-bottom: 0;
  }
  progress {
    width: 5rem;
    accent-color: var(--amber);
  }
  kbd {
    opacity: 0.65;
    margin-left: 0.3rem;
  }
</style>
