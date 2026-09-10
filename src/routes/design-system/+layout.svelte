<script lang="ts">
  import PageLayout from "$lib/components/baseline/PageLayout.svelte";
  import Button from "$lib/components/baseline/Button.svelte";
  import IconChevron from "$lib/components/icons/IconChevron.svelte";

  let { children } = $props();
  let asideOpen = $state(true);

  const sections = [
    { href: "#layout", label: "Page layout" },
    { href: "#toolbar", label: "Toolbar" },
    { href: "#icons", label: "Icons" },
    { href: "#buttons", label: "Buttons" },
    { href: "#model", label: "Model" },
  ];
</script>

<svelte:head>
  <title>Design system · Home Recor Editor</title>
</svelte:head>

<PageLayout {asideOpen} scrollMain>
  {#snippet header()}
    <div class="titles">
        <strong>Design system</strong>
        <span>Baseline chrome · icons, buttons, model, layout</span>
      </div>
    <div class="brand">
      <a class="back" href="/">Editor</a>
      <Button
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title={asideOpen ? "Hide sections" : "Show sections"}
        toggle
        bind:pressed={asideOpen}
      >
        {#snippet glyph()}
          <IconChevron dir={asideOpen ? "left" : "right"} />
        {/snippet}
      </Button>
    </div>
  {/snippet}

  {#snippet aside()}
    <nav class="nav" aria-label="Design system sections">
      {#each sections as section (section.href)}
        <a href={section.href}>{section.label}</a>
      {/each}
    </nav>
  {/snippet}

  {@render children()}
</PageLayout>

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  strong {
    font-size: 0.9rem;
  }

  span {
    font-size: 0.7rem;
    color: var(--cream-dim);
  }

  .back {
    font-size: 0.8rem;
    color: var(--amber);
    text-decoration: none;
  }

  .back:hover {
    text-decoration: underline;
  }

  .nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    gap: 0.15rem;
  }

  .nav a {
    color: var(--cream);
    text-decoration: none;
    font-size: 0.8rem;
    padding: 0.45rem 0.55rem;
    border-radius: 5px;
  }

  .nav a:hover {
    background: #252d38;
  }
</style>
