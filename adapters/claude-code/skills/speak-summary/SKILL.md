---
name: speak-summary
description: Speak a short summary of the current work aloud using the local macOS voice. Use when the user asks to hear something read aloud, asks you to speak or say a result out loud, turns on spoken output or autoplay for the session, or asks how to configure spoken output and voices.
argument-hint: "[optional text to speak]"
allowed-tools: Bash(sayeth:*), Bash(sayeth)
---

# Speaking a summary aloud

Speak with the `sayeth` command:

```bash
sayeth "Deploy verified. All routes healthy, nothing in the logs."
```

It wraps the local macOS `say` voice — free, offline, no account, no per-character billing. It also accepts stdin: `echo "..." | sayeth`.

If `$ARGUMENTS` is non-empty, speak that. Otherwise write a summary of the work just completed and speak that.

## The two rules that matter

1. **Speak a summary, not the response.** `sayeth` speaks exactly what you hand it — it is a voice, not a summarizer, and it never sees your output. It caps at 400 characters, but it keeps the **first** 400, trimmed to a sentence boundary. So piping a full response in means the user hears your opening preamble and never hears the result. Write the spoken line deliberately: "Deploy verified, all routes healthy" is useful. Never read code, tables, file dumps, or a full answer aloud.

2. **One call per turn.** Never inside a loop, a subagent, or a background job. Parallel agents talking over each other is genuinely unpleasant, and it is the fastest way to make someone turn this off for good.

## Autoplay

Speaking at the end of every substantive turn is armed by a marker file, so it can be toggled without editing config:

```bash
touch ~/.claude/sayeth-autoplay-on    # arm
rm ~/.claude/sayeth-autoplay-on       # mute
```

While armed, a Stop hook nudges once if a substantive turn ends silent. It fails open and never nudges twice in a turn.

## Voices

`sayeth` auto-picks the best installed English voice — Premium, then Enhanced, then Samantha — resolved at call time, so a voice downloaded later is used with no config change.

```bash
sayeth --list      # what's installed, and what it will use
sayeth --dry "..." # print what would be spoken, without speaking
```

If the voice sounds robotic, the machine only has base voices. Enhanced and Premium voices are a **free** download, and the difference is dramatic:

> System Settings → Accessibility → Spoken Content → System Voice → **Manage Voices** → expand English → pick any voice marked *Enhanced* or *Premium*

That is a GUI download — the user has to do it themselves. Tell them, don't try to script it.

## Configuration

```bash
sayeth config show                            # effective config, API key redacted
sayeth config set say.voice "Ava (Enhanced)"  # pin a voice
sayeth config set say.rate 200                # talk faster
sayeth config set maxChars 250                # shorter summaries
```

## The ElevenLabs backend

`sayeth` can also speak through ElevenLabs, which sounds better and **bills the user's account per character**. It is opt-in for exactly that reason. Do not switch to it on your own initiative — only when the user explicitly asks for the better voice, and check whether they have a budget in mind first.

```bash
export ELEVENLABS_API_KEY=...
sayeth --backend elevenlabs "just this once, with the good voice"
sayeth config set backend say   # back to free
```
