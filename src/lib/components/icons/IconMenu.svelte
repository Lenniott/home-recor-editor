<script lang="ts">
  let { size = 16, dir = "left" }: { size?: number; dir?: "left" | "right" } =
    $props();
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
  <path
    d="M3 12H21M3 6H21M3 18H21"
  />
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
