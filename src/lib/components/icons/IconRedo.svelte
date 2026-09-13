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
<path d="M21 9H7.5C5.01472 9 3 11.0147 3 13.5C3 15.9853 5.01472 18 7.5 18H12M17 13L21 9L17 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
