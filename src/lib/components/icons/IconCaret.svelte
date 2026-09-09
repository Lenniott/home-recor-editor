<script lang="ts">
  let { size = 16, dir = "left" }: { size?: number; dir?: "left" | "right" } = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  {#if dir === "left"}
    <polygon points="16 5 8 12 16 19" />
  {:else}
    <polygon points="8 5 16 12 8 19" />
  {/if}
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
