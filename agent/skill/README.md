# The xNotary Agent Skill

`xnotary/` is an [Agent Skill](https://agentskills.io): a `SKILL.md` an agent loads when a task
matches its description. It teaches an agent to choose a route from the site's published rules
(`/situations/rules.json`, generated from `app/src/site/situations.ts`) and to timestamp and
verify with the reference OpenTimestamps client — without xNotary hosting anything.

Install it by copying the folder where your agent looks for skills, for example for Claude Code:

```bash
cp -r agent/skill/xnotary ~/.claude/skills/
```

It ships with the site under the same licence (AGPL-3.0-or-later). When `rules.json` changes
shape, bump `RULES_FORMAT` in `app/src/site/situations-export.ts` and update the skill in the same
change. The design behind it, and what comes next (a local MCP server and CLI), is in
`docs/agents.md`.
