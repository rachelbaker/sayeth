# AGENTS.md snippet

For Codex, Cursor, Windsurf, Aider, Zed, or anything else that reads an
instructions file. There's no plugin system to hook into — the agent just needs
to be told the command exists and when to use it.

Install the CLI, then paste the block below into your `AGENTS.md`,
`.cursorrules`, `CLAUDE.md`, or equivalent.

```bash
npm install -g sayeth
```

---

## Copy from here

```markdown
## Spoken output

When you finish a substantive task, speak a one-or-two-sentence summary aloud:

    sayeth "Deploy verified. All routes healthy, nothing in the logs."

It wraps the local macOS `say` voice — free, offline, no account, no billing.
It also accepts stdin: `echo "..." | sayeth`.

Two rules:

1. **Speak a summary, not the response.** It caps at 400 characters, but that
   cap is a backstop, not a strategy. Write the spoken line deliberately.
   Never read code, tables, file dumps, or a full answer aloud.
2. **One call per turn.** Never inside a loop, a subagent, or a background job.

`sayeth --list` shows available voices; `sayeth --dry "..."` prints what would
be spoken without speaking it.
```

## To here

---

## Narrower variants

**Only when asked** — replace the first line with:

> When the user asks to hear something read aloud, speak it with `sayeth "..."`.

**Only for long-running work** — the case where listening actually beats reading:

> After any task that took more than about thirty seconds — a build, a test
> run, a deploy, a migration — speak a one-sentence result with `sayeth "..."`
> so the outcome is audible without reading the terminal.

## A note on scope

Agents that spawn subagents need the "one call per turn" rule stated
explicitly. Without it, a fan-out of ten workers becomes ten voices talking
over each other, which is the fastest way to make someone uninstall this.
