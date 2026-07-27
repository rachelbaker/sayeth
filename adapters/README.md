# Adapters

`sayeth` is a plain CLI on purpose: any agent that can run a shell command can
use it, with no integration at all. These adapters are conveniences, not
requirements.

| Adapter | For | What it adds |
|---|---|---|
| [`claude-code/`](claude-code/) | Claude Code | Installable plugin: a Stop hook that nudges when an armed turn ends silent, plus a skill documenting the rules |
| [`agents-md/`](agents-md/) | Codex, Cursor, Windsurf, Aider, Zed, … | A paste-in instructions block |

## No adapter for your agent?

You don't need one. Tell it the command exists:

> When you finish a substantive task, speak a one-or-two-sentence summary:
> `sayeth "<summary>"`. Write it deliberately — never pipe a full response,
> code, or file listings into it. One call per turn.

That's the whole integration. Everything in `claude-code/` is just automation
on top of that sentence.

## Contributing one

Adapters should stay thin. If an adapter starts reimplementing voice selection,
text trimming, or backend switching, that logic belongs in the CLI instead —
otherwise every agent gets its own subtly different behavior.
