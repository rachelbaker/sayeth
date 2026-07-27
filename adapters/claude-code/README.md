# sayeth — Claude Code plugin

Speaks a short summary aloud at the end of each substantive turn.

The plugin is a thin wrapper: all it does is teach Claude Code when to call the
`sayeth` CLI, plus a Stop hook that nudges once if an armed turn ends silent.

## Prerequisite

Install the CLI first — the plugin calls it, it doesn't bundle it.

```bash
npm install -g sayeth
```

## Install

```bash
claude plugin marketplace add rachelbaker/sayeth
claude plugin install sayeth
```

Then arm autoplay:

```bash
touch ~/.claude/sayeth-autoplay-on
```

## What you get

**A Stop hook** that blocks once, with a reminder, if a substantive turn (≥120
visible characters) ends without speaking. It:

- runs only while `~/.claude/sayeth-autoplay-on` exists, so muting is `rm`
- guards on `stop_hook_active`, so it can never loop
- fails open on any doubt — a missed nudge is fine, a stuck session is not
- counts `sayeth`, `speak`, `say`, or an ElevenLabs `generate_tts` call as speech

**A skill** (`/sayeth:speak-summary`) documenting the two rules that actually
matter: speak a summary rather than the response, and one call per turn.

## Configuration

| Variable | Default | |
|---|---|---|
| `SAYETH_AUTOPLAY_MARKER` | `~/.claude/sayeth-autoplay-on` | marker file that arms the hook |
| `SAYETH_MIN_CHARS` | `120` | below this many visible chars, a turn is a trivial ack and is not nudged |

## Muting

```bash
rm ~/.claude/sayeth-autoplay-on
```

The hook stays installed and inert. `touch` the file again to re-arm.

## Not using autoplay?

Skip the marker file entirely. The skill still works on request — ask Claude to
speak something, or run `/sayeth:speak-summary`.

## Validating a local checkout

```bash
claude plugin validate ./adapters/claude-code
```
