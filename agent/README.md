# xNotary for AI assistants

This folder is a plugin with one Agent Skill, `xnotary` (`skills/xnotary/SKILL.md`). It teaches an
assistant to choose a route from the site's published rules (`/situations/rules.json`, generated
from `app/src/site/situations.ts`), to report it the way the site does — traffic light, sources,
the day they were checked — and to timestamp and verify with the reference OpenTimestamps client.
Nothing is hosted: the skill reads static files, and a timestamp sends only a 32-byte digest.

The assistant never signs or gives consent for you. Where a step needs your signature, it hands
you to the site or to your own signing tool.

## Install

**Claude Code** — the repository is a plugin marketplace:

```
/plugin marketplace add elkojo/xNotary
/plugin install xnotary@xnotary-digital
```

**Claude (claude.ai, desktop app)** — Settings → Capabilities → Skills → upload a zip of
`agent/skills/xnotary/` (the folder that holds `SKILL.md`).

**ChatGPT, Codex and other assistants that read Agent Skills** — add the same folder as a skill in
the assistant's skills or plugins settings. Assistants without skills can be pointed at
`https://xnotary.digital/llms.txt`, which links the rules and states the same limits.

**From a checkout** — copy the folder where your assistant reads skills, for example
`cp -r agent/skills/xnotary ~/.claude/skills/`.

## Maintaining it

When `rules.json` changes shape, bump `RULES_FORMAT` in `app/src/site/situations-export.ts` and
update `SKILL.md` in the same change: a test holds the two together. The plan beyond this — a local
MCP server and CLI that can run a whole task, and signing approved by the person on their own
device — is in `docs/agents.md`.
