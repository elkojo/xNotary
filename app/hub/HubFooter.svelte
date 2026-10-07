<!-- The footer of the site's own pages: the front page and /support/. -->
<script lang="ts">
  import { SERVICES } from '../src/site/services';
  import { SUPPORT_HREF } from '../src/site/support';

  const SOURCE_URL = 'https://github.com/elkojo/xNotary';
  const revision = __APP_REVISION__;
  const commit = __APP_COMMIT__;
  const revisionUrl =
    commit && !revision.endsWith('-dirty') ? `${SOURCE_URL}/tree/${commit}` : null;
</script>

<footer class="site">
  <div>
    <div class="family-links">
      {#each SERVICES as s}
        <a href={s.href}>{s.name}{s.external ? ' ↗' : ''}</a>
      {/each}
      <a href={SUPPORT_HREF}>Support</a>
    </div>
    Your documents never leave your device. Free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >{#if revisionUrl}, built from
      <a href={revisionUrl} target="_blank" rel="noopener noreferrer"
        ><span class="mono">{revision}</span></a
    >{/if}. <a href="/THIRD-PARTY.txt">Third-party code</a>. Not legal advice.
  </div>
</footer>
