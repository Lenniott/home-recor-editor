<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "tertiary";
  type IconPosition = "none" | "left" | "right";
  type Size = "md" | "tool";

  let {
    variant = "secondary",
    size = "md",
    toggle = false,
    pressed = $bindable(false),
    icon = "none",
    label = true,
    tooltip = false,
    title = undefined,
    type = "button",
    disabled = false,
    class: className = "",
    children,
    glyph,
    onclick,
    ...rest
  }: HTMLButtonAttributes & {
    variant?: Variant;
    size?: Size;
    toggle?: boolean;
    pressed?: boolean;
    icon?: IconPosition;
    label?: boolean;
    tooltip?: boolean;
    children?: Snippet;
    glyph?: Snippet;
    onclick?: HTMLButtonAttributes["onclick"];
  } = $props();

  const showGlyph = $derived(icon !== "none" && !!glyph);
  const tooltipText = $derived(tooltip ? (title ?? "").trim() : "");
  const tooltipId = $props.id();
  const ariaPressed = $derived(toggle ? pressed : rest["aria-pressed"]);

  let tipOpen = $state(false);
  let tipLeft = $state(0);
  let tipTop = $state(0);
  let tipAbove = $state(false);
  let showTimer: ReturnType<typeof setTimeout> | undefined;

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return () => node.remove();
  }

  function placeTip(button: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    const gap = 6;
    tipLeft = rect.left + rect.width / 2;
    const roomBelow = window.innerHeight - rect.bottom;
    tipAbove = roomBelow < 56 && rect.top > roomBelow;
    tipTop = tipAbove ? rect.top - gap : rect.bottom + gap;
  }

  function scheduleTip(event: Event): void {
    if (!tooltipText) return;
    const button = event.currentTarget as HTMLElement;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      placeTip(button);
      tipOpen = true;
      window.addEventListener("scroll", hideTip, true);
    }, 350);
  }

  function hideTip(): void {
    clearTimeout(showTimer);
    window.removeEventListener("scroll", hideTip, true);
    tipOpen = false;
  }

  function onFocus(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).matches(":focus-visible")) return;
    scheduleTip(event);
  }

  function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }): void {
    if (toggle && !disabled) pressed = !pressed;
    onclick?.(event);
  }
</script>

<button
  {...rest}
  {type}
  {disabled}
  class="btn {className}"
  class:primary={variant === "primary"}
  class:secondary={variant === "secondary"}
  class:tertiary={variant === "tertiary"}
  class:toggle
  class:on={toggle ? pressed : ariaPressed === true || ariaPressed === "true"}
  class:icon-only={!label}
  class:icon-left={showGlyph && icon === "left"}
  class:icon-right={showGlyph && icon === "right"}
  class:tool={size === "tool"}
  aria-describedby={tooltipText ? tooltipId : undefined}
  aria-pressed={ariaPressed}
  onclick={handleClick}
  onpointerenter={scheduleTip}
  onpointerleave={hideTip}
  onfocus={onFocus}
  onblur={hideTip}
>
  {#if showGlyph && icon === "left"}
    <span class="glyph">{@render glyph?.()}</span>
  {/if}
  {#if label && children}
    <span class="label">{@render children()}</span>
  {/if}
  {#if showGlyph && icon === "right"}
    <span class="glyph">{@render glyph?.()}</span>
  {/if}
  {#if tooltipText}
    <span id={tooltipId} class="sr-only">{tooltipText}</span>
  {/if}
  {#if tooltipText && tipOpen}
    <span
      class="tip"
      class:above={tipAbove}
      role="tooltip"
      aria-hidden="true"
      {@attach portal}
      style:left="{tipLeft}px"
      style:top="{tipTop}px"
    >{tooltipText}</span>
  {/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-family: var(--font-label);
    font-size: 0.8rem;
    letter-spacing: 0;
    line-height: 1;
    color: var(--cream);
    background: #252d38;
    border: 1px solid var(--panel-line);
    border-radius: 5px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .btn:hover:not(:disabled) {
    border-color: var(--panel-highlight);
    background: #333f4e;
  }

  .btn:active:not(:disabled) {
    background: #171d26;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 2px;
  }

  .primary {
    background: var(--amber);
    border-color: var(--amber);
    color: var(--chassis);
  }

  .primary:hover:not(:disabled) {
    background: #9cc4f2;
    border-color: #9cc4f2;
    color: var(--chassis);
  }

  .primary:active:not(:disabled) {
    background: #6a9ad4;
    border-color: #6a9ad4;
  }

  .secondary {
    background: #252d38;
    border-color: var(--panel-line);
    color: var(--cream);
  }

  .tertiary {
    background: transparent;
    border-color: transparent;
    color: var(--cream-dim);
    padding: 0.35rem 0.15rem;
  }

  .tertiary:hover:not(:disabled) {
    background: transparent;
    border-color: transparent;
    color: var(--cream);
  }

  .tertiary:active:not(:disabled) {
    background: transparent;
  }

  .on.secondary,
  .on.tertiary,
  .on.primary {
    background: var(--amber);
    border-color: var(--amber);
    color: var(--chassis);
  }

  .on.secondary:hover:not(:disabled),
  .on.tertiary:hover:not(:disabled),
  .on.primary:hover:not(:disabled) {
    background: #9cc4f2;
    border-color: #9cc4f2;
    color: var(--chassis);
  }

  .on.secondary:active:not(:disabled),
  .on.tertiary:active:not(:disabled),
  .on.primary:active:not(:disabled) {
    background: #6a9ad4;
    border-color: #6a9ad4;
  }

  .icon-only {
    padding: 0.4rem;
  }

  .tool {
    height: 24px;
    min-height: 24px;
    padding: 0 0.45rem;
    font-size: 0.7rem;
    border-radius: 4px;
  }

  .tool.icon-only {
    width: 24px;
    padding: 0;
  }

  .tool.tertiary {
    padding: 0 0.35rem;
  }

  .glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .label {
    white-space: nowrap;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .tip {
    position: fixed;
    z-index: 1000;
    width: max-content;
    max-width: 16rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--panel-line);
    border-radius: 4px;
    background: var(--chassis);
    color: var(--cream);
    font-family: var(--font-label);
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.3;
    text-align: center;
    white-space: normal;
    pointer-events: none;
    transform: translateX(-50%);
    box-shadow: 0 8px 24px #0008;
  }

  .tip.above {
    transform: translate(-50%, -100%);
  }
</style>
