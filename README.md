<p align="center">
  <img src="assets/hero.svg" width="170" alt="A proclamation scroll reading HEAR YE, HEAR YE, its words turning into a sound waveform">
</p>

<h1 align="center">sayeth</h1>

<p align="center"><em>/ˈseɪ.əθ/</em></p>

<p align="center">
  <strong>Hear ye, hear ye</strong> — the build is green.<br>
  Spoken output for coding agents. Free, local, and offline by default.
</p>

<p align="center">
  <code>npm install -g sayeth</code>
</p>

---

Your agent just spent forty seconds working and wrote you nine hundred words about
it. You read the last line.

`sayeth` reads you the last line.

```bash
sayeth "Deploy verified. All routes healthy, nothing in the logs."
```

That's it. That's the tool.

## Why it's free

It wraps macOS `say` — the speech synthesizer already sitting on your Mac. No
account, no API key, no per-character billing, no network. You can run it on a
plane.

There's an ElevenLabs backend too, for when the local voice isn't good enough.
It's opt-in, because it costs money and the free one usually isn't the problem —
see [Make it sound good](#make-it-sound-good-free-two-minutes), which is.

## Install

```bash
npm install -g sayeth
```

Or skip installing and use `npx sayeth "..."` — often the easiest thing to put in
an agent's instructions.

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

## Make it sound good (free, two minutes)

**Do this first.** It is the single highest-impact thing available, and it costs
nothing.

macOS ships **base** voices. They sound like a 2009 GPS unit. **Enhanced** and
**Premium** voices are a free download and sound dramatically better:

> System Settings → Accessibility → Spoken Content → System Voice →
> **Manage Voices** → expand English → pick anything marked *Enhanced* or
> *Premium* → download

`sayeth` resolves the best installed voice at call time — Premium, then Enhanced,
then Samantha — so a voice you download later is picked up with **no config
change**. Confirm with:

```bash
sayeth --list
```

If someone tells you this sounds robotic, they have base voices. It's always
that.

## Configure

```bash
sayeth config show                                  # effective config, key redacted
sayeth config path                                  # where the file lives
sayeth config set say.voice "Ava (Enhanced)"        # pin a voice
sayeth config set say.rate 200                      # talk faster
sayeth config set maxChars 250                      # shorter summaries
```

Config lives at `~/.config/sayeth/config.json` (respects `XDG_CONFIG_HOME`) and is
written `0600`, because it can hold an API key.

**Precedence, highest first:** CLI flags → environment → config file → defaults.

Environment: `SAYETH_BACKEND`, `SAYETH_VOICE`, `SAYETH_RATE`, `SAYETH_MAX_CHARS`,
`ELEVENLABS_API_KEY`.

## The good voice

ElevenLabs sounds better and bills your account per character, which is exactly
why it isn't the default.

```bash
export ELEVENLABS_API_KEY=...          # preferred: keep the key out of files
sayeth --backend elevenlabs "just this once, with the good voice"

# or make it the default
sayeth config set backend elevenlabs
sayeth --list                          # your account's voices, with ids
sayeth config set elevenlabs.voiceId <id>
```

Defaults to `eleven_flash_v2_5`, roughly half the per-character cost of the full
model. Going back to free is one command:

```bash
sayeth config set backend say
```

## Wire it into your agent

Any agent that can run a shell command already works. Add this to its instructions
file — `CLAUDE.md`, `AGENTS.md`, `.cursorrules`:

> When you finish a substantive task, speak a one-or-two-sentence summary:
> `sayeth "<summary>"`. Write it deliberately — never pipe a full response, code,
> or file listings into it. One call per turn.

That sentence is the whole integration. The [`adapters/`](adapters/) directory
just automates it:

- **[Claude Code plugin](adapters/claude-code/)** — a Stop hook that nudges once
  if a substantive turn ends silent, plus a skill documenting the rules:

  ```bash
  claude plugin marketplace add rachelbaker/sayeth
  claude plugin install sayeth
  touch ~/.claude/sayeth-autoplay-on
  ```

- **[AGENTS.md snippet](adapters/agents-md/)** — paste-in block for Codex, Cursor,
  Windsurf, Aider, and Zed.

### Two rules that matter more than they look

1. **Speak a summary, not the response.** The 400-character cap is a backstop, not
   a strategy. "Deploy verified, all routes healthy" is useful. The first 400
   characters of a diff is noise with a voice.
2. **One call per turn.** Never in a loop, a subagent, or a background job. Ten
   parallel agents talking over each other is the fastest way to make someone
   uninstall this.

## Programmatic use

```js
import { speak } from 'sayeth'

await speak('Migration finished. Fourteen tables, no errors.')
await speak('Using the good voice.', { flags: { backend: 'elevenlabs' } })
```

## Platform support

The `say` backend is macOS-only — it's wrapping an Apple binary. The ElevenLabs
backend runs anywhere Node does, playing through `afplay`, `mpv`, `ffplay`, or
`mpg123`, whichever it finds first.

## Develop

```bash
npm test
```

54 tests, and they cost nothing to run: `say` is shimmed onto `PATH` so the suite
is silent, and the ElevenLabs request builder is exported separately with an
injectable `fetch`, so nothing ever hits the API. You can run the tests on a
plane too.

<details>
<summary>A parser bug worth knowing about, if you're wrapping <code>say</code> yourself</summary>

`say -v '?'` pads the voice-name column to 20 characters — but a name of **19 or
more characters collapses the gap to a single space**. `Samantha (Enhanced)` is
exactly 19.

So any parser that splits on two-or-more spaces silently breaks on one of the
most likely voices a user will install. `sayeth` anchors on the locale field at
the end of the line instead, and handles the numeric-region locales (`ar_001`)
while it's there.

</details>

## License

MIT. Do as thou wilt.
