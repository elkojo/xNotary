<script lang="ts">
  import type { OtsStatus } from '../lib/ots';

  interface Props {
    status: OtsStatus;
  }
  let { status }: Props = $props();

  const tone = $derived(
    status.kind === 'confirmed' ? 'ok' : status.kind === 'pending' ? 'pending' : 'muted',
  );
  const label = $derived(
    status.kind === 'confirmed'
      ? 'Confirmed on Bitcoin'
      : status.kind === 'pending'
        ? 'Pending anchor'
        : 'Anchored, not checked',
  );
</script>

<span class="badge {tone}">{label}</span>
