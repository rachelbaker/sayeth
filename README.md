<p align="center">
  <img src="assets/hero.svg" width="170" alt="A proclamation scroll reading HEAR YE, HEAR YE, its words turning into a sound waveform">
</p>

<h1 align="center">sayeth</h1>

<p align="center"><em>/ˈseɪ.əθ/</em></p>

<p align="center">
  <strong>Give your coding agent a voice.</strong><br>
  It says what it did, out loud, so you can look away from the terminal.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sayeth"><img src="https://img.shields.io/npm/v/sayeth?color=2B6BE4&label=npm" alt="npm version"></a>
  <a href="https://github.com/rachelbaker/sayeth/actions/workflows/test.yml"><img src="https://github.com/rachelbaker/sayeth/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/sayeth?color=2B6BE4" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/dependencies-0-2B6BE4" alt="zero dependencies">
  <img src="https://img.shields.io/badge/node-%3E%3D18-2B6BE4" alt="Node 18 or newer">
</p>

---

Your agent finishes a long task and writes several hundred words about it. You read
the last line, if that.

`sayeth` lets it tell you instead:

```bash
sayeth "Deploy verified. All routes healthy, nothing in the logs."
```

You will rarely run this yourself. Your agent runs it, and most of this README is
about teaching it when and what to say.

## How it works

Your agent composes a sentence and passes it to `sayeth`. `sayeth` speaks it.
That is the whole mechanism — no model, no parsing of your agent's output, which
`sayeth` never sees.

**What you hear is exactly the string your agent passed in.** The audio is only
as good as that sentence, which is why [shaping what it says](#shaping-what-it-says)
is the part that decides whether you keep this installed.

The only change `sayeth` makes is **truncation**: strings over the character
limit (400 by default) are cut at the last sentence boundary that fits.
Truncation keeps the *beginning*, so it cannot find a conclusion at the end —
pipe a whole response in and you hear the preamble, never the result.

Speech comes from the macOS `say` voice already on your Mac: no account, no API
key, no per-token billing. An [ElevenLabs backend](#using-elevenlabs) is available
if you want a better voice, but try [a free voice download](#get-a-better-voice)
first — that is usually the real fix.

## Install

```bash
npm install -g sayeth
```

Confirm it landed:

```bash
sayeth --check
```

For the local `say` backend this verifies the executable and voices exist. It
**cannot** confirm the calling agent can reach your speakers — see
[sandboxed agents](#sandboxed-agents).

## Connect it to your agent

From inside your project:

```bash
sayeth init
```

There is nothing to copy. `init` works out which agent the project uses, writes
the instructions into that agent's file, and reports which file it touched.

| It finds | It writes to |
|---|---|
| `AGENTS.md` — Zed and most others | `AGENTS.md` |
| `.cursorrules` | `.cursorrules` |
| `.windsurfrules` | `.windsurfrules` |
| `CONVENTIONS.md` — Aider | `CONVENTIONS.md` |
| `CLAUDE.md` | `CLAUDE.md` |
| nothing at all | creates `AGENTS.md`, the cross-tool convention |

Restart your agent afterwards so it re-reads the file.

Re-running `init` is safe. The block is fenced in `<!-- sayeth:begin -->` markers,
so a second run updates it in place instead of appending a duplicate — re-run
after upgrading to pick up revised instructions. Everything else in the file is
left alone.

```bash
sayeth init --print                      # show the block, write nothing
sayeth init --agent codex                # Codex, incl. host-audio guidance
sayeth init --agent cursor               # override detection
sayeth init --file ~/.claude/CLAUDE.md   # write somewhere specific
```

### Sandboxed agents

Codex shares `AGENTS.md` with other tools, so `init` cannot identify it from the
filename. Pass `--agent codex` and the generated instructions will tell Codex to
request direct host-audio access:

```bash
sayeth init --agent codex
```

Without it, a sandboxed `sayeth` call **exits 0 while producing no sound** — the
command succeeds, you hear nothing, and nothing reports an error.

### Claude Code

`init` works, but the plugin is better: it adds a Stop hook that nudges once when
a substantive turn ends without speaking, so it cannot quietly stop happening.

```bash
claude plugin marketplace add rachelbaker/sayeth
```

```bash
claude plugin install sayeth
```

```bash
touch ~/.claude/sayeth-autoplay-on
```

That last file is the on-switch — `rm` it for silence, `touch` it to re-arm.
Details in [`adapters/claude-code/`](adapters/claude-code/).

<details>
<summary>Setting it up by hand instead</summary>

<br>

`sayeth init --print` emits exactly this. Paste it into `AGENTS.md`,
`.cursorrules`, `CLAUDE.md`, or whatever your agent reads:

````markdown
## Spoken output

After finishing a substantive task, speak a summary aloud — one or two sentences, under 400 characters:

    sayeth "Two things need you. // One, approve the migration. // Two, the staging key expires Friday. // Everything else passed."

- `//` becomes a short spoken pause. A listener has no headings or bullets, so
  pauses are the only structure available to you.
- Anything the user must DO comes first: count them, then one per pause, as
  above. What merely happened comes after. If nothing needs them, say so.
- `sayeth` speaks exactly what you pass it. It does not summarize; it truncates,
  keeping the FIRST 400 characters — so pass a line you wrote, never a whole
  response, code, tables, or file listings.
- One call per reply. Never inside a loop, a subagent, or a background job.
- If the user wants quiet: `sayeth mute 30m` (or `sayeth mute`, `sayeth unmute`).
  While muted it is a silent no-op that still exits 0 — keep calling it normally.
````

Variants — speak-only-when-asked, speak-only-after-slow-tasks — are in
[`adapters/agents-md/`](adapters/agents-md/).

</details>

## Get a better voice

**Do this before anything else.** It is free, takes two minutes, and is the
difference between "neat" and "I turned it off."

macOS ships **base** voices. They sound like a 2009 GPS. **Enhanced** and
**Premium** voices are a free download:

> System Settings → Accessibility → Spoken Content → System Voice →
> **Manage Voices** → expand English → pick anything marked *Enhanced* or
> *Premium* → download

`sayeth` resolves the best installed voice at call time, so one you download later
is used with **no config change**. Check what it found:

```bash
sayeth --list
```

If this sounds robotic to anyone, they have base voices. It is always that.

## Shaping what it says

A voice reading the wrong thing is worse than silence. This section is what
decides whether the tool survives its first week.

### Speak the conclusion, not the work

| Instead of | Say |
|---|---|
| the full test output | "Tests pass. Forty-two of them, in nine seconds." |
| the stack trace | "Build failed in the auth module — missing env var." |
| a list of changed files | "Migration done. Fourteen tables, no errors." |
| "I have completed the task you requested and…" | "Done. Two files changed." |

The reason this is not merely stylistic: truncation keeps the **first** 400
characters, so piping a whole response in fails in the worst possible way.

```bash
echo "I will now begin working on the task you requested. First I examined
the configuration. Then I updated the handler. [...] The deploy is verified
and all routes are healthy." | sayeth
```

You hear *"I will now begin working on the task you requested…"* and the deploy
result — the only part you wanted — is never spoken.

**One call per reply.** Never inside a loop, a subagent, or a background job. Ten
parallel agents talking over each other is the fastest way to uninstall this.

### Use pauses as structure

A listener has no headings, bullets, or whitespace. A pause is the only structure
available, so `//` becomes a short silence:

```bash
sayeth "Two things need you. // One, approve the migration. // Two, the staging key expires Friday. // Everything else passed."
```

You hear the count, a beat, each item, then what doesn't need you. The built-in
instructions teach agents this shape, so it works without configuration.

```bash
sayeth config set pauseMs 700     # default 450; 0 disables
```

On `say` this is real silence (`[[slnc]]`). On ElevenLabs it becomes a sentence
break, because engine-specific markup risks being read aloud.

### Make it shorter

Two levers, and the difference matters:

| | What it does |
|---|---|
| `maxChars` | **Truncates.** A hard ceiling on what gets spoken. |
| `style` | **Instructs.** Free-text guidance your agent reads before writing. |

Truncation alone cannot make output succinct — cutting a rambling sentence gives
you a rambling fragment. `sayeth` wires the two together: **the cap is written
into the instructions**, so lowering it changes the brief as well as enforcing it.

```bash
sayeth config set maxChars 120 && sayeth init
```

At 400 the agent is asked for one or two sentences; at 250, one sentence; at 120,
"ONE short sentence, under 120 characters."

### Say what you actually want to hear

`style` is free text appended to the instructions, so you can ask for anything:

```bash
sayeth config set style "Always name the git branch. Never sound enthusiastic." && sayeth init
```

| Goal | `style` |
|---|---|
| Just the verdict | `"State only the outcome. No process, no narration."` |
| Failures matter more | `"If anything failed, lead with the failure and name the file."` |
| Context you keep asking for | `"Always include the branch name and the test count."` |
| Less personality | `"Be dry and factual. No enthusiasm, no adjectives."` |
| Timing | `"Mention how long the task took if it was over a minute."` |

Both settings need `sayeth init` to take effect, and apply to **new** agent
sessions — instructions are read at session start. Check what yours will read:

```bash
sayeth init --print
```

## Muting

You're on a call, someone's asleep, you're recording. Silence it without
uninstalling anything or editing config:

```bash
sayeth mute 30m
```

Accepts `2h`, `90s`, `1h30m`, or a bare number for minutes. `sayeth mute` with no
duration lasts until you run `sayeth unmute`. `sayeth --check` reports where you
stand.

**Muted speaking is a no-op that still exits 0.** Your agent calls `sayeth` as
usual and carries on — it just makes no sound. A mute is your choice, not a
failure for the caller to report or retry, so nothing else in your agent's
behaviour changes.

**Timed mutes expire on their own.** A forgotten `sayeth mute 30m` cannot leave
you permanently silent; the deadline passes and the state file deletes itself.

Everything except speaking still works while muted — `--dry`, `--list`, `--check`,
and all `config` commands. A duration that cannot be parsed is refused outright
rather than guessed at, so a typo never mutes you for the wrong length of time.

## Command reference

```bash
sayeth "text to speak"           # speak it
echo "text" | sayeth             # same, from stdin
sayeth init                      # write instructions into your agent's file
sayeth mute 30m                  # quiet for a while
sayeth mute                      # quiet until further notice
sayeth unmute
```

| Option | What it does |
|---|---|
| `-b, --backend <name>` | `say` (default), `command`, or `elevenlabs` |
| `-v, --voice <name>` | voice name for `say`, or voice **id** for elevenlabs |
| `-r, --rate <wpm>` | rate for `say`. Default `180`; under 150 sounds sedated, over 220 gets choppy |
| `--max-chars <n>` | length cap. Default `400`; `0` disables truncation |
| `--dry` | print what *would* be spoken, say nothing. Use this while tuning |
| `--list` | list available voices and show which is selected |
| `--check` | report prerequisites and mute state, **then speak a test phrase** so you can tell whether audio actually reaches you. Skipped when muted, or when the backend bills per character |
| `-h, --help` | full help |
| `--version` | version |
| `--` | everything after this is text, not flags |

`sayeth init` takes `--agent <name>`, `--file <path>`, and `--print`.

```bash
sayeth config show               # effective config, API key redacted
sayeth config path               # where the config file lives
sayeth config get <key>
sayeth config set <key> <value>
sayeth config unset <key>        # back to the default
```

| Key | Default | |
|---|---|---|
| `backend` | `say` | `say` or `elevenlabs` |
| `maxChars` | `400` | truncation cap; `0` disables |
| `style` | *(none)* | free-text guidance written into the instructions |
| `pauseMs` | `450` | silence per `//`; `0` disables |
| `say.voice` | *(auto)* | pin a voice instead of auto-selecting |
| `say.rate` | `180` | words per minute |
| `command.shell` | *(none)* | pipeline that speaks stdin — see [local engines](#local-open-source-engines) |
| `command.voice` | *(none)* | substituted for `{{voice}}` in `command.shell` |
| `elevenlabs.apiKey` | *(none)* | prefer the environment variable |
| `elevenlabs.voiceId` | *(a default voice)* | from `--backend elevenlabs --list` |
| `elevenlabs.modelId` | `eleven_flash_v2_5` | cheaper than the full model |
| `elevenlabs.stability` | `0.5` | |
| `elevenlabs.similarityBoost` | `0.75` | |

## Configuration

Config lives at `~/.config/sayeth/config.json` (respects `XDG_CONFIG_HOME`) and is
written `0600`, because it can hold an API key.

**Precedence, highest first:** CLI flags → environment variables → config file →
defaults.

| Environment variable | Overrides |
|---|---|
| `SAYETH_BACKEND` | `backend` |
| `SAYETH_VOICE` | `say.voice` |
| `SAYETH_RATE` | `say.rate` |
| `SAYETH_MAX_CHARS` | `maxChars` |
| `ELEVENLABS_API_KEY` | `elevenlabs.apiKey` |
| `SAYETH_ELEVENLABS_API_KEY` | `elevenlabs.apiKey`, if the above is unset |
| `SAYETH_ELEVENLABS_VOICE_ID` | `elevenlabs.voiceId` |
| `SAYETH_ELEVENLABS_MODEL_ID` | `elevenlabs.modelId` |

An exported-but-empty variable counts as unset, so a stray `export SAYETH_VOICE=`
in a shell profile will not silently blank your config.

## Local open-source engines

The `say` backend is macOS-only, so on Linux and Windows there is no built-in
free option. The `command` backend closes that: point it at any local TTS engine
that reads stdin, and `sayeth` pipes text into it.

```bash
sayeth config set backend command
sayeth config set command.shell "piper -m {{voice}} --output-raw | aplay -r 22050 -f S16_LE -t raw -"
sayeth config set command.voice ~/voices/en_US-lessac-medium.onnx
```

```bash
sayeth --check
```

One backend covers the whole ecosystem — including engines released after this
was written — so `sayeth` depends on none of them and inherits none of their
licences. Starting points:

| Engine | Licence | `command.shell` |
|---|---|---|
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | GPL-3.0 | `piper -m {{voice}} --output-raw \| aplay -r 22050 -f S16_LE -t raw -` |
| [Kokoro](https://github.com/nazdridoy/kokoro-tts) | Apache 2.0 | `kokoro-tts - out.wav --format wav && afplay out.wav` |
| [Chatterbox](https://www.resemble.ai/learn/models/chatterbox) | MIT | via its own CLI wrapper |
| espeak-ng | GPL-3.0 | `espeak-ng -v en-us --stdout \| aplay` |
| macOS `say` | — | `say -v "{{voice}}"` — handy for trying this out with no install |

On macOS use `afplay -` in place of `aplay`.

**Licences:** invoking a GPL binary as a separate process does not affect
`sayeth`'s MIT licence, the same way an MIT tool may shell out to `ffmpeg`.
Choosing what to install is yours. Two to avoid for commercial work: **XTTS v2**
is non-commercial under CPML *and* Coqui shut down in 2024, so no one can sell
you a licence; **F5-TTS** is CC-BY-NC.

### Why there is no `{{text}}` placeholder

Text comes from a language model, so it must never reach a shell. `{{voice}}` is
substituted because it comes from your config, but **the spoken text is written
to stdin, always** — which is why a summary containing backticks or `$(…)` is
just words to be read aloud.

`sayeth --check` can confirm the first command in your pipeline exists on `PATH`,
then prove the rest by speaking through it. It cannot validate the pipeline
statically, and does not pretend to.

## Using ElevenLabs

The `say` backend is free and needs no setup. ElevenLabs sounds better and bills
your account per character, which is why it is opt-in.

**1. Get an API key.** Sign up at [elevenlabs.io](https://elevenlabs.io), then open
your profile menu → **API Keys** → **Create API Key**. Copy it; the key is shown
once. The free tier includes a monthly character allowance, so you can try this
without a card.

**2. Give the key to `sayeth`.** The environment keeps it out of files:

```bash
export ELEVENLABS_API_KEY=sk_your_key_here
```

Or store it in the config file, which is written `0600`:

```bash
sayeth config set elevenlabs.apiKey sk_your_key_here
```

**3. Confirm it is wired up.** Makes no API call, costs nothing:

```bash
sayeth --backend elevenlabs --check
```

**4. Pick a voice.** Lists your account's voices with their ids. Uses the voices
endpoint, which does not consume character credits:

```bash
sayeth --backend elevenlabs --list
```

```bash
sayeth config set elevenlabs.voiceId <the-id-you-want>
```

**5. Use it** per call, keeping `say` as the default:

```bash
sayeth --backend elevenlabs "just this once, with the good voice"
```

Or switch over entirely — and back again:

```bash
sayeth config set backend elevenlabs
```

```bash
sayeth config set backend say
```

### Cost control

The default model is `eleven_flash_v2_5`, roughly half the per-character price of
the full model. Switch with `sayeth config set elevenlabs.modelId eleven_multilingual_v2`.

The character cap applies here too, so one spoken line has a predictable worst
case. Lower it with `sayeth config set maxChars 250`.

⚠️ **Never put a metered backend in an unattended job.** If an agent speaks from a
cron or scheduled task, keep it on `say` — nobody is watching the meter.

### Errors you might hit

| Message | Meaning |
|---|---|
| `no ElevenLabs API key` | Nothing in `ELEVENLABS_API_KEY` or the config file |
| `ElevenLabs 401 — check ELEVENLABS_API_KEY` | Key is wrong, revoked, or mistyped |
| `ElevenLabs 429 — rate limited or out of credits` | Allowance exhausted, or too many calls |
| `no audio player found` | Needs `afplay` (macOS), or `mpv`/`ffplay`/`mpg123` on Linux |

## JavaScript API

```js
import { speak } from 'sayeth'

await speak('Migration finished. Fourteen tables, no errors.')
await speak('Using the good voice.', { flags: { backend: 'elevenlabs' } })
```

`speak()` resolves to `{ spoke: false, muted: true }` without speaking when a mute
is active — a mute is not an error, so it does not throw. Pass
`{ ignoreMute: true }` only for something the user asked for in the moment.

## Platform support

The `say` backend is macOS-only; it wraps an Apple binary. The ElevenLabs backend
runs anywhere Node does, playing through `afplay`, `mpv`, `ffplay`, or `mpg123` —
whichever it finds first. Node 18+, zero dependencies.

## Develop

```bash
npm test
```

The suite is silent and free: `say` is shimmed onto `PATH`, and the ElevenLabs
request builder is exported separately with an injectable `fetch`, so nothing ever
reaches the API.

<details>
<summary>A <code>say</code> parsing trap, if you are wrapping it yourself</summary>

<br>

`say -v '?'` pads the voice-name column to 20 characters — but a name of **19 or
more characters collapses that gap to a single space**, and `Samantha (Enhanced)`
is exactly 19.

Any parser splitting on two-or-more spaces therefore breaks on one of the most
likely voices a user will install. `sayeth` anchors on the locale field at the end
of the line instead, and handles numeric-region locales (`ar_001`) while it is
there.

`say` also reads `[[...]]` as embedded speech commands, so text containing double
brackets is silently swallowed rather than spoken — "the array index `[[0]]` bug"
loses the index. `sayeth` escapes them before inserting its own commands.

</details>

## License

MIT. Do as thou wilt.
