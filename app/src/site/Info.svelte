<!--
  An explanation kept off the page until someone asks for it: a small ⓘ that
  opens a bubble on hover, and keeps it open on click or tap. Shared by every
  service, like the bar, so the same mark means the same thing everywhere.

  Hover alone would leave touch screens and keyboards without it, which is why
  a click pins it. The bubble is `position: fixed` and placed from the button's
  own rectangle, because the panels it sits in clip their overflow; and it is
  clamped to the viewport, because a bubble that runs off a phone's edge is
  one nobody can read.

  Clicks inside it stop at its edge: it is used inside a <label> and inside a
  drop zone, and opening an explanation must not tick a box or open a file
  picker.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** What the button is announced as. */
    label?: string;
    /** Where the longer answer lives, if anywhere. */
    more?: string;
    children: Snippet;
  }
  let { label = 'More information', more, children }: Props = $props();

  const id = `info-${Math.random().toString(36).slice(2, 10)}`;
  const GUTTER = 12;

  let hovered = $state(false);
  let pinned = $state(false);
  let button = $state<HTMLButtonElement>();
  let bubble = $state<HTMLSpanElement>();
  let place = $state({ left: 0, top: 0 });
  const open = $derived(hovered || pinned);

  function position() {
    if (!button || !bubble) return;
    const at = button.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const centred = at.left + at.width / 2 - width / 2;
    const left = Math.max(GUTTER, Math.min(centred, innerWidth - GUTTER - width));
    // Below the mark if it fits, above it if not.
    const below = at.bottom + 8;
    const top = below + height > innerHeight - GUTTER ? Math.max(GUTTER, at.top - 8 - height) : below;
    place = { left, top };
  }

  function close() {
    pinned = false;
    hovered = false;
  }

  $effect(() => {
    if (!open || !bubble) return;
    position();
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button?.contains(target) && !bubble?.contains(target)) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    addEventListener('scroll', position, true);
    addEventListener('resize', position);
    addEventListener('pointerdown', outside);
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('scroll', position, true);
      removeEventListener('resize', position);
      removeEventListener('pointerdown', outside);
      removeEventListener('keydown', escape);
    };
  });
</script>

<span
  class="info"
  role="presentation"
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
>
  <button
    bind:this={button}
    type="button"
    class="info-mark"
    aria-label={label}
    aria-expanded={open}
    aria-controls={id}
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pinned) close();
      else pinned = true;
    }}
    onkeydown={(e) => e.stopPropagation()}>i</button
  >
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <span
      bind:this={bubble}
      {id}
      class="info-bubble"
      role="note"
      style="left:{place.left}px;top:{place.top}px"
      onclick={(e) => e.stopPropagation()}
    >
      {@render children()}
      {#if more}<a class="info-more" href={more}>More in Help →</a>{/if}
    </span>
  {/if}
</span>
