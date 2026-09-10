<script lang="ts">
  import type { Snippet } from "svelte";
  import Button from "./Button.svelte";
  import IconExpanded from "../icons/IconExpanded.svelte";

  let {
    title,
    open = $bindable(true),
    collapsible = true,
    tools,
    children,
  }: {
    title: string;
    open?: boolean;
    collapsible?: boolean;
    tools?: Snippet;
    children?: Snippet;
  } = $props();
</script>

{#if open || collapsible}
  <section class="view-panel" class:collapsed={!open}>
    <header class="bar">
      <h2>{title}</h2>
      {#if tools || collapsible}
        <div class="tools">
          {@render tools?.()}
          {#if collapsible}
            <Button
              variant="secondary"
              icon="left"
              label={false}
              tooltip
              title={open ? "Collapse" : "Expand"}
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
              aria-pressed={open}
              onclick={() => (open = !open)}
            >
              {#snippet glyph()}
                <IconExpanded {open} />
              {/snippet}
            </Button>
          {/if}
        </div>
      {/if}
    </header>
    {#if open}
      <div class="body">{@render children?.()}</div>
    {/if}
  </section>
{/if}

<style>
  .view-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 0;
    border-bottom: 1px solid var(--panel-line);
    padding:1rem;
  }

  .collapsed {
    flex: 0 0 auto;
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

  h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--cream-dim);
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
</style>
