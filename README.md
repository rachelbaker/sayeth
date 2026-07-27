# sayeth

**Spoken output for coding agents.** Free and local by default, good voice on demand.

Long agent sessions are easier to follow when the agent tells you what happened instead of
making you read another wall of terminal text. `sayeth` is the one command any agent can
call to do that — Claude Code, Codex, Cursor, a shell script, a git hook, whatever.

```bash
npx sayeth "Deploy verified. All routes healthy, nothing in the logs."
```

- **Free by default.** Uses macOS `say` — local, offline, no account, no API key, no per-character billing.
- **Good voice when you want it.** Switch to ElevenLabs with one command; switch back just as easily.
- **Picks the best voice you have.** Premium → Enhanced → Samantha → system default, resolved at call time, so a voice you download later is used with no config change.
- **Speaks summaries, not transcripts.** Caps at 400 characters, trimming at a sentence boundary so it never stops mid-thought.
- **No dependencies.** Node 18+ and nothing else.

---

## Install

```bash
npm install -g sayeth
```

Or don't install it at all — `npx sayeth "..."` works fine, and that's usually the easiest
thing to put in an agent's instructions.

## Use

```bash
sayeth "Tests pass. Forty-two of them, in nine seconds."
echo "build finished" | sayeth

sayeth --dry "what would you say?"     # print it, don't speak it
sayeth --list                          # what voices you have
sayeth --check                         # is the current backend usable?
```

| Option | |
|---|---|
| `-b, --backend <name>` | `say` or `elevenlabs` |
| `-v, --voice <name>` | voice name (say) or voice id (elevenlabs) |
| `-r, --rate <wpm>` | speech rate for `say` (default 180) |
| `--max-chars <n>` | length cap (default 400; `0` disables) |
| `--dry` | print what would be spoken |
| `--list` | list available voices |
| `--check` | report whether the backend is ready |
| `--` | everything after this is text, not flags |

## Make it sound good (free, 2 minutes)

This is the single highest-impact thing you can do, and it costs nothing.

macOS ships **base** voices. They sound robotic. **Enhanced** and **Premium** voices are a
free download and sound dramatically better:

> System Settings → Accessibility → Spoken Content → System Voice → **Manage Voices**
> → expand English → pick any voice marked *Enhanced* or *Premium* → download

`sayeth` picks the best installed voice automatically, so once it's downloaded there is
nothing to configure. Run `sayeth --list` to confirm it was detected.

## Configuration

```bash
sayeth config show                                  # effective config (API key redacted)
sayeth config path                                  # where the file lives
sayeth config set say.voice "Ava (Premium)"         # pin a voice
sayeth config set say.rate 200                      # talk faster
sayeth config set maxChars 250                      # shorter summaries
```

Config lives at `~/.config/sayeth/config.json` (respects `XDG_CONFIG_HOME`) and is written
`0600`, because it can hold an API key.

**Precedence, highest first:** CLI flags → environment → config file → defaults.

Environment: `SAYETH_BACKEND`, `SAYETH_VOICE`, `SAYETH_RATE`, `SAYETH_MAX_CHARS`,
`ELEVENLABS_API_KEY`.

## Using ElevenLabs instead

`say` is the default precisely because it's free. ElevenLabs sounds much better and bills
your account per character, so it's opt-in.

```bash
export ELEVENLABS_API_KEY=...          # preferred: keep the key out of files
sayeth --backend elevenlabs "just this once, with the good voice"

# or make it the default
sayeth config set backend elevenlabs
sayeth --list                         # your account's voices, with ids
sayeth config set elevenlabs.voiceId <id>
```

To store the key on disk instead of the environment:

```bash
sayeth config set elevenlabs.apiKey sk-...
```

Defaults to `eleven_flash_v2_5`, roughly half the per-character cost of the full model.
Switch with `sayeth config set elevenlabs.modelId eleven_multilingual_v2`.

Going back to free is one command:

```bash
sayeth config set backend say
```

## Wiring it into an agent

Any agent that can run a shell command can use this. Add something like this to its
instructions file — `CLAUDE.md`, `AGENTS.md`, `.cursorrules`:

> When you finish a substantive task, speak a one-or-two-sentence summary:
> `sayeth "<summary>"`. Write the summary deliberately — never pipe a full response,
> code, tables, or file listings into it. One call per turn.

That sentence is the entire integration. For convenience there are ready-made adapters
in [`adapters/`](adapters/):

- **[Claude Code plugin](adapters/claude-code/)** — a Stop hook that nudges once if a
  substantive turn ends silent, plus a skill documenting the rules:

  ```bash
  claude plugin marketplace add rachelbaker/sayeth
  claude plugin install sayeth
  touch ~/.claude/sayeth-autoplay-on
  ```

- **[AGENTS.md snippet](adapters/agents-md/)** — a paste-in block for Codex, Cursor,
  Windsurf, Aider, and Zed.

Two rules matter more than they look:

1. **Speak a summary, not the response.** The 400-character cap is a backstop, not a
   strategy. "Deploy verified, all routes healthy" is useful; the first 400 characters of
   a diff is noise.
2. **One call per turn.** Never inside a loop, a subagent, or a background job — parallel
   agents talking over each other is genuinely awful.

## Programmatic use

```js
import { speak } from 'sayeth'

await speak('Migration finished. Fourteen tables, no errors.')
await speak('Using the good voice.', { flags: { backend: 'elevenlabs' } })
```

## Platform support

The `say` backend is macOS-only. The ElevenLabs backend works anywhere Node does, playing
audio through `afplay`, `mpv`, `ffplay`, or `mpg123` — whichever it finds first.

## Development

```bash
npm test        # node --test; no network, no sound, no spend
```

The ElevenLabs tests never call the API — request building is exported separately and
`listVoices` takes an injectable `fetch`, so the whole suite runs for free.

## License

MIT
