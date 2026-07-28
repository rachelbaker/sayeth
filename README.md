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

### How it works

Your agent composes that sentence and passes it to `sayeth` as an argument.
`sayeth` speaks it aloud. That is the entire mechanism.

There is no model here, and no parsing of your agent's output — `sayeth` never
sees it. **Whatever you hear is exactly the string your agent passed in**, so the
quality of the audio is the quality of that sentence. Getting your agent to write
a good one is [the part that matters](#teaching-it-to-say-something-worth-hearing),
and most of this README is about that.

Speech comes from the macOS `say` voice already on your Mac: no account, no API
key, no per-token billing, nothing to sign up for. An
[ElevenLabs backend](#using-elevenlabs) is available if you want a better voice,
but try [the free voice download](#make-it-sound-good-free-two-minutes) first —
that is usually the actual fix.

### The one thing it changes about your text

`sayeth` truncates. If the string exceeds the character limit (400 by default),
it cuts at the last sentence boundary that fits.

**Truncating is not summarizing.** It keeps the *beginning* of the string and
discards the rest, so it cannot find a conclusion buried at the end — piping a
whole response in gets you the opening preamble, spoken confidently, with the
result cut off. See [why that matters](#why-this-isnt-optional).

Control the limit per call or in config, or turn it off with `0`:

```bash
sayeth --max-chars 200 "shorter, please"
```

```bash
sayeth config set maxChars 200
```

To make the spoken lines genuinely shorter rather than merely cut off, change
what your agent writes — see [brevity](#controlling-brevity).

> **You will rarely type this yourself.** Your agent does. Everything below is
> about teaching it when to.

## Set it up

Two steps: install the command, then tell your agent about it.

### Step 1 — install the command

```bash
npm install -g sayeth
```

Check it worked:

```bash
sayeth --check
```

### Step 2 — tell your agent about it

From inside your project:

```bash
sayeth init
```

That's it. There is nothing to copy. `init` works out which agent the project is
set up for, writes the instructions into that agent's file, and tells you exactly
which file it touched:

| It finds | It writes to |
|---|---|
| `AGENTS.md` — Codex, Zed, and most others | `AGENTS.md` |
| `.cursorrules` | `.cursorrules` |
| `.windsurfrules` | `.windsurfrules` |
| `CONVENTIONS.md` — Aider | `CONVENTIONS.md` |
| `CLAUDE.md` | `CLAUDE.md` |
| nothing at all | creates `AGENTS.md`, the cross-tool convention |

Then restart your agent so it re-reads the file.

**It's safe to re-run.** The block is fenced in `<!-- sayeth:begin -->` markers,
so a second run updates in place rather than appending a duplicate — re-run it
after upgrading to pick up revised instructions. Existing content in the file is
left alone.

```bash
sayeth init --print              # see the block, write nothing
sayeth init --agent cursor       # override the detection
sayeth init --file ~/.claude/CLAUDE.md   # write somewhere specific
```

#### Claude Code: use the plugin instead

`init` works, but the plugin is better here — it adds a Stop hook that nudges
once if a substantive turn ends without speaking, so it can't quietly stop
happening:

```bash
claude plugin marketplace add rachelbaker/sayeth
```

```bash
claude plugin install sayeth
```

```bash
touch ~/.claude/sayeth-autoplay-on
```

That last file is the on-switch. `rm` it to go quiet, `touch` it again to
re-arm. Details in [`adapters/claude-code/`](adapters/claude-code/).

<details>
<summary>Doing it by hand instead</summary>

<br>

`sayeth init --print` emits exactly this. Paste it into `AGENTS.md`,
`.cursorrules`, `CLAUDE.md`, or whatever your agent reads:

````markdown
## Spoken output

After finishing a substantive task, speak a one-or-two-sentence summary:

    sayeth "Deploy verified. All routes healthy."

- Write that line deliberately. `sayeth` speaks exactly what you pass it — it is
  a voice, not a summarizer, and it keeps only the FIRST 400 characters. Piping a
  full response in means the user hears your preamble and never hears the result.
  Never read code, tables, or file listings aloud.
- One call per reply. Never inside a loop, a subagent, or a background job.
- If the user wants quiet: `sayeth mute 30m` (or `sayeth mute`, `sayeth unmute`).
  While muted it is a silent no-op that still exits 0 — keep calling it normally
  rather than working around it.
````

Longer variants — speak-only-when-asked, speak-only-after-slow-tasks — are in
[`adapters/agents-md/`](adapters/agents-md/).

</details>

## Teaching it to say something worth hearing

This is the part that decides whether you keep it installed. A voice reading the
wrong thing is worse than silence.

**Speak the conclusion, not the work.**

| Don't say | Say |
|---|---|
| the full test output | "Tests pass. Forty-two of them, in nine seconds." |
| the stack trace | "Build failed in the auth module — missing env var." |
| a list of changed files | "Migration done. Fourteen tables, no errors." |
| "I have completed the task you requested and…" | "Done. Two files changed." |

### Why this isn't optional

Truncation keeps the **first** 400 characters, so piping a whole response in
fails in the worst possible way:

```bash
echo "I will now begin working on the task you requested. First I examined
the configuration. Then I updated the handler. [...] The deploy is verified
and all routes are healthy." | sayeth
```

You hear *"I will now begin working on the task you requested. First I examined
the configuration…"* and the deploy result — the only part you wanted — is never
spoken at all. The cap is a seatbelt, not a summarizer.

**One call per reply.** Never inside a loop, a subagent, or a background job. Ten
parallel agents talking over each other is the fastest way to uninstall this.

## Controlling brevity

Two different levers, and the difference matters:

| | What it does |
|---|---|
| `maxChars` | **Truncates.** A hard ceiling on what gets spoken. |
| `style` | **Instructs.** Free-text guidance your agent reads before writing the line. |

Truncation alone can't make a summary succinct — cutting a rambling sentence
gives you a rambling fragment. To get genuinely shorter output you have to change
what your agent *writes*.

`sayeth` wires the two together: **the cap you set is written into the
instructions**, so lowering it changes the brief as well as enforcing it.

```bash
sayeth config set maxChars 120
```

```bash
sayeth init
```

Re-running `init` rewrites the block in place. At 400 the agent is asked for
"one or two sentences"; at 250, "one sentence"; at 120, "ONE short sentence,
under 120 characters."

### Saying what you actually want to hear

`style` is free text appended to the instructions, so you can ask for anything:

```bash
sayeth config set style "Always name the git branch. Never sound enthusiastic."
```

```bash
sayeth init
```

Useful ones:

| Goal | `style` |
|---|---|
| Just the verdict | `"State only the outcome. No process, no narration."` |
| Failures matter more | `"If anything failed, lead with the failure and name the file."` |
| Context you keep asking for | `"Always include the branch name and the test count."` |
| Less personality | `"Be dry and factual. No enthusiasm, no adjectives."` |
| Timing | `"Mention how long the task took if it was over a minute."` |

Check what your agent will actually read:

```bash
sayeth init --print
```

Both settings only take effect for **new** agent sessions, since the instructions
are read at session start.

## Make it sound good (free, two minutes)

**Do this before anything else.** It costs nothing and it's the difference
between "neat" and "I turned it off."

macOS ships **base** voices. They sound like a 2009 GPS. **Enhanced** and
**Premium** voices are a free download:

> System Settings → Accessibility → Spoken Content → System Voice →
> **Manage Voices** → expand English → pick anything marked *Enhanced* or
> *Premium* → download

`sayeth` resolves the best installed voice at call time, so a voice you download
later is used with **no config change**. Check what it found:

```bash
sayeth --list
```

If anyone says this sounds robotic, they have base voices. It is always that.

## Muting it for a while

You're on a call, someone's asleep, you're recording. Silence it without
uninstalling anything or editing config:

```bash
sayeth mute 30m
```

Also takes `2h`, `90s`, `1h30m`, or a bare number for minutes. To mute with no
end time:

```bash
sayeth mute
```

Turn it back on:

```bash
sayeth unmute
```

Check where you stand:

```bash
sayeth --check
```

**While muted, speaking is a no-op that still exits 0.** Your agent calls
`sayeth` exactly as before and carries on normally — it just doesn't make a
sound. A mute is your choice, not a failure for the caller to report or retry,
so nothing in your agent's output changes.

**A timed mute expires on its own.** A forgotten `sayeth mute 30m` can't leave
you permanently silent — the deadline passes and the state file deletes itself.
Only `sayeth mute` with no duration lasts until you unmute.

Everything except speaking still works while muted: `--dry`, `--list`,
`--check`, and all `config` commands. And a duration it can't parse is refused
outright rather than guessed at, so a typo never mutes you for the wrong length
of time.

## Commands

The full interface. Your agent only ever needs the first line; the rest is for
you, setting it up.

```bash
sayeth "text to speak"           # speak it
echo "text" | sayeth             # same, from stdin
sayeth mute 30m                  # quiet for a while; also 2h, 90s, 1h30m
sayeth mute                      # quiet until you say otherwise
sayeth unmute
```

| Option | What it does |
|---|---|
| `-b, --backend <name>` | `say` (default) or `elevenlabs` |
| `-v, --voice <name>` | voice name for `say`, or voice **id** for elevenlabs |
| `-r, --rate <wpm>` | speech rate for `say`. Default `180`; under 150 sounds sedated, over 220 gets choppy |
| `--max-chars <n>` | length cap. Default `400`; `0` disables trimming |
| `--dry` | print what *would* be spoken, and say nothing. Use this while tuning |
| `--list` | list available voices and show which one is selected |
| `--check` | report whether the current backend is ready to use |
| `-h, --help` | full help |
| `--version` | version |
| `--` | everything after this is text, not flags |

```bash
sayeth config show               # effective config, with the API key redacted
sayeth config path               # where the config file lives
sayeth config get <key>          # read one value
sayeth config set <key> <value>  # write one value
sayeth config unset <key>        # back to the default
```

Settable keys: `backend`, `maxChars`, `say.voice`, `say.rate`,
`elevenlabs.apiKey`, `elevenlabs.voiceId`, `elevenlabs.modelId`,
`elevenlabs.stability`, `elevenlabs.similarityBoost`.

## Configuration

Config lives at `~/.config/sayeth/config.json` (respects `XDG_CONFIG_HOME`) and
is written `0600`, because it can hold an API key.

**Precedence, highest first:** CLI flags → environment variables → config file →
defaults.

| Environment variable | Overrides |
|---|---|
| `SAYETH_BACKEND` | `backend` |
| `SAYETH_VOICE` | `say.voice` |
| `SAYETH_RATE` | `say.rate` |
| `SAYETH_MAX_CHARS` | `maxChars` |
| `ELEVENLABS_API_KEY` | `elevenlabs.apiKey` |

An exported-but-empty variable counts as unset, so a stray `export SAYETH_VOICE=`
in a shell profile won't silently blank your config.

## Using ElevenLabs

The `say` backend is free and needs no setup. ElevenLabs sounds better, and
bills your account per character — which is why it's opt-in. Full setup:

**1. Get an API key.** Sign up at [elevenlabs.io](https://elevenlabs.io), then
open your profile menu → **API Keys** → **Create API Key**. Copy it; the key is
shown once. The free tier includes a monthly character allowance, so you can try
this without a card.

**2. Give the key to `sayeth`.** Either put it in your environment, which keeps
it out of files:

```bash
export ELEVENLABS_API_KEY=sk_your_key_here
```

Or store it in the config file, which is written `0600`:

```bash
sayeth config set elevenlabs.apiKey sk_your_key_here
```

**3. Confirm it's wired up.** This makes no API call and costs nothing:

```bash
sayeth --backend elevenlabs --check
```

**4. Pick a voice.** This lists the voices on your account with their ids. It
calls the voices endpoint, which doesn't consume character credits:

```bash
sayeth --backend elevenlabs --list
```

```bash
sayeth config set elevenlabs.voiceId <the-id-you-want>
```

**5. Use it.** Either per-call, keeping `say` as your default:

```bash
sayeth --backend elevenlabs "just this once, with the good voice"
```

Or switch the default over entirely:

```bash
sayeth config set backend elevenlabs
```

Going back to free is one command:

```bash
sayeth config set backend say
```

### Cost control

Defaults to `eleven_flash_v2_5`, roughly half the per-character price of the
full model. Switch with `sayeth config set elevenlabs.modelId eleven_multilingual_v2`.

The 400-character cap applies here too, so a single spoken line is a predictable
worst case. Lower it with `sayeth config set maxChars 250`.

⚠️ **Don't put a metered backend in an unattended job.** If an agent speaks on a
cron or in a scheduled task, keep it on `say` — nobody is watching the meter.

### Errors you might hit

| Message | Meaning |
|---|---|
| `no ElevenLabs API key` | Nothing in `ELEVENLABS_API_KEY` or the config file |
| `ElevenLabs 401 — check ELEVENLABS_API_KEY` | Key is wrong, revoked, or has a typo |
| `ElevenLabs 429 — rate limited or out of credits` | Monthly allowance exhausted, or too many calls |
| `no audio player found` | Needs `afplay` (macOS), or `mpv`/`ffplay`/`mpg123` on Linux |

## Calling it from JavaScript

```js
import { speak } from 'sayeth'

await speak('Migration finished. Fourteen tables, no errors.')
await speak('Using the good voice.', { flags: { backend: 'elevenlabs' } })
```

## Platform support

The `say` backend is macOS-only — it wraps an Apple binary. The ElevenLabs
backend runs anywhere Node does, playing through `afplay`, `mpv`, `ffplay`, or
`mpg123`, whichever it finds first. Node 18+, zero dependencies.

## Develop

```bash
npm test
```

54 tests that cost nothing to run: `say` is shimmed onto `PATH` so the suite is
silent, and the ElevenLabs request builder is exported separately with an
injectable `fetch`, so nothing ever hits the API.

<details>
<summary>A parser bug worth knowing, if you're wrapping <code>say</code> yourself</summary>

<br>

`say -v '?'` pads the voice-name column to 20 characters — but a name of **19 or
more characters collapses the gap to a single space**. `Samantha (Enhanced)` is
exactly 19.

So any parser splitting on two-or-more spaces silently breaks on one of the most
likely voices a user will install. `sayeth` anchors on the locale field at the
end of the line instead, and handles numeric-region locales (`ar_001`) while
it's there.

</details>

## License

MIT. Do as thou wilt.
