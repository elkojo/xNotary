<!--
  /support/: a thank-you, and a way to support the project. The content is SupportCard, which
  every service also shows in a dialog once a task is finished (src/site/SupportLink.svelte).
-->
<script lang="ts">
  import SiteBar from '../src/site/SiteBar.svelte';
  import { site } from '../src/site/lang.svelte';
  import SupportCard from '../src/site/SupportCard.svelte';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
  /** This page is wholly in the chosen language, so it says so: a translator then leaves it alone. */
  $effect(() => {
    document.documentElement.lang = site.lang;
  });
</script>

<SiteBar bind:menu />

<main class="support-page">
  <div class="support-wrap">
    <SupportCard />
  </div>
</main>

<HubFooter />
