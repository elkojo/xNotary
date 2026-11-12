<!--
  /ai/: use xNotary from an AI assistant. Three ways, the one most people can use first: standing
  instructions in a chat assistant's project (nothing installed), one text for an agent on the
  reader's computer, and the skill uploaded in an assistant's settings. The texts are built in
  src/site/ai-install.ts from this page's origin, where tests hold them to the site's limits.

  Copying sends nothing. What the reader then writes to an assistant is between them and its
  provider, and the page says so.
-->
<script lang="ts">
  import Fresh from '../src/site/Fresh.svelte';
  import SiteBar from '../src/site/SiteBar.svelte';
  import { MARKETPLACE, SKILL_PATH, SKILL_ZIP_PATH, agentInstall, projectInstructions } from '../src/site/ai-install';
  import { pick, site } from '../src/site/lang.svelte';
  import { SITUATIONS_HREF } from '../src/site/services';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
  const origin = typeof location === 'undefined' ? 'https://xnotary.digital' : location.origin;
  const project = $derived(projectInstructions(origin, site.lang));
  const agent = $derived(agentInstall(origin, site.lang));

  /** Which box was copied last, or could not be: the label says so until something else is copied. */
  let copied = $state<{ which: string; ok: boolean } | null>(null);
  async function copy(which: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = { which, ok: true };
    } catch {
      copied = { which, ok: false };
    }
  }

  const TEXT = {
    en: {
      title: 'xNotary in your AI assistant',
      intro:
        'Your assistant answers from the same rules as this site — every question, the traffic light, the sources and when they were checked. It never signs, sends or approves anything for you.',
      projectHead: 'In a chat assistant: remember it in a project',
      projectWho: 'Claude, ChatGPT, Gemini and others. Nothing to install. Recommended.',
      projectSteps: [
        'Create a project in your assistant (in Gemini, a Gem).',
        'Copy the text below and paste it into the project’s instructions.',
        'Ask your question in that project, in your own words.',
      ],
      agentHead: 'On your computer: paste one text into your agent',
      agentWho: 'Claude Code, Codex, Hermes and other agents that can install skills.',
      agentSteps: [
        'Copy the text below and paste it into your agent.',
        'It shows the commands for itself and asks before running them.',
      ],
      agentManual: 'Or type the command yourself',
      skillHead: 'Install the skill in Claude or ChatGPT',
      skillWho: 'For the skill in every conversation, not one project.',
      skillDownload: 'Download the skill (.zip)',
      skillSteps: [
        'Claude: in Customize → Skills choose Add and pick the zip.',
        'ChatGPT (not on the free plan): in Plugins → Skills choose Upload and pick the zip, or the folder inside it if the zip is refused.',
        'Menus move between versions. On a Team or Enterprise plan an administrator may have to allow skills first.',
      ],
      skillFile: 'The skill file itself',
      onceHead: 'Just once',
      once: 'Type what you need on Start from your situation and choose “Ask your own AI”: it copies your question for any assistant.',
      onceLink: 'Start from your situation',
      copy: 'Copy',
      copiedOk: 'Copied',
      copiedNo: 'Select the text and copy it',
      foot:
        'Copying sends nothing. What you write to an assistant is between you and its provider. The skill reads this site’s public rules; nothing about you is sent to this site. Information, not legal advice.',
    },
    cs: {
      title: 'xNotary ve vašem AI asistentovi',
      intro:
        'Váš asistent odpovídá podle stejných pravidel jako tento web — všechny otázky, semafor, zdroje a datum jejich ověření. Nikdy za vás nic nepodepíše, neodešle ani neschválí.',
      projectHead: 'V chatovém asistentovi: uložte si to do projektu',
      projectWho: 'Claude, ChatGPT, Gemini a další. Nic se neinstaluje. Doporučujeme.',
      projectSteps: [
        'Ve svém asistentovi vytvořte projekt (v Gemini Gem).',
        'Zkopírujte text níže a vložte ho do pokynů projektu.',
        'V tomto projektu se ptejte vlastními slovy.',
      ],
      agentHead: 'Ve vašem počítači: vložte jeden text svému agentovi',
      agentWho: 'Claude Code, Codex, Hermes a další agenti, kteří umí instalovat skilly.',
      agentSteps: ['Zkopírujte text níže a vložte ho svému agentovi.', 'Sám si vybere příkazy pro sebe a před spuštěním se zeptá.'],
      agentManual: 'Nebo příkaz napište sami',
      skillHead: 'Nainstalujte skill do Claude nebo ChatGPT',
      skillWho: 'Aby byl skill k dispozici v každé konverzaci, ne jen v jednom projektu.',
      skillDownload: 'Stáhnout skill (.zip)',
      skillSteps: [
        'Claude: v Customize → Skills zvolte Add a vyberte zip.',
        'ChatGPT (ne v bezplatné verzi): v Plugins → Skills zvolte Upload a vyberte zip, nebo složku v něm, pokud zip odmítne.',
        'Nabídky se mezi verzemi mění. V tarifu Team nebo Enterprise může být nutné, aby skilly nejdřív povolil správce.',
      ],
      skillFile: 'Samotný soubor skillu',
      onceHead: 'Jen jednou',
      once: 'Napište, co potřebujete, na stránce Co potřebujete vyřídit a zvolte „Zeptat se svého AI“: zkopíruje váš dotaz pro jakéhokoli asistenta.',
      onceLink: 'Co potřebujete vyřídit',
      copy: 'Kopírovat',
      copiedOk: 'Zkopírováno',
      copiedNo: 'Označte text a zkopírujte ho',
      foot:
        'Kopírováním se nic neodesílá. Co napíšete asistentovi, je mezi vámi a jeho poskytovatelem. Skill čte veřejná pravidla tohoto webu; nic o vás se tomuto webu neodesílá. Informace, ne právní rada.',
    },
  };
  const t = $derived(pick(TEXT));
  $effect(() => {
    document.documentElement.lang = site.lang;
  });

  const label = (which: string) => (copied?.which === which ? (copied.ok ? t.copiedOk : t.copiedNo) : t.copy);
</script>

<SiteBar bind:menu />

<main class="product-view ai-page">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
    </div>

    <section class="ai-way lead">
      <h2>{t.projectHead}</h2>
      <p class="ai-who">{t.projectWho}</p>
      <ol>
        {#each t.projectSteps as step}<li>{step}</li>{/each}
      </ol>
      <div class="ai-copy">
        <pre translate="no" data-copy="project">{project}</pre>
        <button class="button small dark" type="button" onclick={() => copy('project', project)}><Fresh text={label('project')} /></button>
      </div>
    </section>

    <section class="ai-way">
      <h2>{t.agentHead}</h2>
      <p class="ai-who">{t.agentWho}</p>
      <ol>
        {#each t.agentSteps as step}<li>{step}</li>{/each}
      </ol>
      <div class="ai-copy">
        <pre translate="no" data-copy="agent">{agent}</pre>
        <button class="button small dark" type="button" onclick={() => copy('agent', agent)}><Fresh text={label('agent')} /></button>
      </div>
      <details class="ai-manual">
        <summary>{t.agentManual}</summary>
        <pre translate="no">Claude Code:  claude plugin marketplace add {MARKETPLACE}
              claude plugin install xnotary@xnotary-digital
Hermes:       hermes skills install {origin}{SKILL_PATH}
Codex:        mkdir -p ~/.codex/skills/xnotary &amp;&amp; curl -fsSL {origin}{SKILL_PATH} -o ~/.codex/skills/xnotary/SKILL.md</pre>
      </details>
    </section>

    <section class="ai-way">
      <h2>{t.skillHead}</h2>
      <p class="ai-who">{t.skillWho}</p>
      <div class="action-group">
        <a class="button small dark" href={SKILL_ZIP_PATH} download="xnotary-skill.zip">{t.skillDownload}</a>
        <a class="button small ghost-dark" href={SKILL_PATH} target="_blank" rel="noopener">{t.skillFile}</a>
      </div>
      <ol>
        {#each t.skillSteps as step}<li>{step}</li>{/each}
      </ol>
    </section>

    <section class="ai-way">
      <h2>{t.onceHead}</h2>
      <p>{t.once} <a href={SITUATIONS_HREF}>{t.onceLink} →</a></p>
    </section>

    <p class="situations-foot">{t.foot}</p>
  </div>
</main>

<HubFooter />
