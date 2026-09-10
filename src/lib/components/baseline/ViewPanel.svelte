<script lang="ts">
  import type { Snippet } from "svelte";
  import Button from "./Button.svelte";
  import IconExpanded from "../icons/IconExpanded.svelte";

  let {
    title,
    open = $bindable(true),
    collapsible = true,
    onexpand,
    tools,
    children,
  }: {
    title: string;
    open?: boolean;
    collapsible?: boolean;
    onexpand?: () => void;
    tools?: Snippet;
    children?: Snippet;
  } = $props();

  const canExpand = $derived(!open && !!onexpand);
  const showToggle = $derived(collapsible || canExpand);

  function toggle(): void {
    if (collapsible) open = !open;
    else onexpand?.();
  }
</script>

<section class="view-panel" class:collapsed={!open}>
  <header class="bar">
    {#if canExpand}
      <button type="button" class="title" onclick={onexpand} aria-expanded="false">
        {title}
      </button>
    {:else}
      <h2>{title}</h2>
    {/if}
    {#if tools || showToggle}
      <div class="tools">
        {@render tools?.()}
        {#if showToggle}
          <Button
            variant="secondary"
            icon="left"
            label={false}
            tooltip
            title={open ? "Collapse" : "Expand"}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            aria-pressed={open}
            onclick={toggle}
          >
            {#snippet glyph()}
              <IconExpanded {open} />
            {/snippet}
          </Button>
        {/if}
      </div>
    {/if}
  </header>
  <div class="body">{@render children?.()}</div>
</section>

<style>
  .view-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 0;
    border-bottom: 1px solid var(--panel-line);
    padding: 1rem;
  }

  .collapsed {
    flex: 0 0 auto;
    padding-top: 0.65rem;
    padding-bottom: 0.65rem;
  }

  .view-panel:last-child {
    border-bottom: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-shrink: 0;
    min-height: 1rem;
  }

  h2,
  .title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--cream-dim);
  }

  .title {
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }

  .title:hover,
  .title:focus-visible {
    color: var(--cream);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .collapsed .body {
    flex: 0 0 auto;
  }
</style>
