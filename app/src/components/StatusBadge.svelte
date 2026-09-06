<script lang="ts">
  import type { OtsStatus } from '../lib/ots';

  interface Props {
    status: OtsStatus;
  }
  let { status }: Props = $props();

  const tone = $derived(
    status.kind === 'confirmed' ? 'good' : status.kind === 'pending' ? 'waiting' : 'muted',
  );
  const label = $derived(
    status.kind === 'confirmed'
      ? 'Confirmed on Bitcoin'
      : status.kind === 'pending'
        ? 'Pending anchor'
        : 'Anchored, not checked',
  );
</script>

<span class="pill {tone}">{label}</span>
