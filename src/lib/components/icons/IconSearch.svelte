<script lang="ts">
  let { size = 16 }: { size?: number } = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <circle cx="11" cy="11" r="7" />
  <path d="M20 20L16.5 16.5" />
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
