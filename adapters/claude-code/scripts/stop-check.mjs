#!/usr/bin/env node
// Stop hook: backstop for the spoken-summary rule.
//
// If a substantive turn ends without speaking, block the stop ONCE with a
// reminder so the assistant speaks before finishing. Fails open on any doubt —
// a missed nudge is fine; a stuck session is not.
//
// Armed only while the marker file exists, so it is trivially muted:
//   touch ~/.claude/sayeth-autoplay-on    # arm
//   rm    ~/.claude/sayeth-autoplay-on    # mute
// Override the location with SAYETH_AUTOPLAY_MARKER.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MARKER =
  process.env.SAYETH_AUTOPLAY_MARKER ||
  join(homedir(), ".claude", "sayeth-autoplay-on");

// Below this many visible characters the turn is a trivial ack — no nudge.
const MIN_SUBSTANTIVE_CHARS = Number(process.env.SAYETH_MIN_CHARS || 120);

// `sayeth ...`, `speak ...` (legacy alias), or bare `say ...`, at the start of a
// command or right after a separator. Anchored so a commit message like
// -m "say something" doesn't count as speech.
//
// Each name must be listed explicitly: `speak` does not contain the substring
// "say", and `sayeth` is not matched by /say\b/-style patterns that require
// trailing whitespace. The lookahead (rather than a trailing \s) matters
// because `echo "done" | sayeth` is a documented invocation that ends with the
// command name — requiring trailing whitespace missed it entirely.
const SPOKE_RE = /(^|[;&|]\s*|\n\s*)(\S*\/)?(sayeth|speak|say)(?![\w-])/;

function allow() {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}
if (!payload || typeof payload !== "object") allow();

// Everything past stdin parsing fails open: an unexpected transcript shape must
// never surface an error, let alone block.
try {
  run();
} catch {
  // fall through to the final allow
}
allow();

function run() {
  // stop_hook_active means this stop IS the continuation a previous block
  // caused. Always allow it through — one nudge per turn, never a loop.
  if (payload.stop_hook_active) allow();
  if (!existsSync(MARKER)) allow();

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) allow();

  const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");

  // Find the last real human prompt: a non-meta user entry with text or an
  // image. Excluded because they'd move the turn boundary: tool_result-only
  // entries, <local-command-stdout> strings, and compact-summary entries.
  let promptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary) continue;

    const content = entry.message?.content;
    if (typeof content === "string") {
      const text = content.trim();
      if (!text || text.startsWith("<local-command-stdout>")) continue;
      promptIdx = i;
      break;
    }
    if (
      Array.isArray(content) &&
      content.some(
        (b) => b && ((b.type === "text" && b.text?.trim()) || b.type === "image")
      )
    ) {
      promptIdx = i;
      break;
    }
  }
  if (promptIdx === -1) allow();

  // Scan everything after that prompt: did the assistant speak, and did it say
  // enough to warrant speaking?
  let spoke = false;
  let visibleChars = 0;
  for (let i = promptIdx + 1; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block) continue;
      if (block.type === "tool_use" && /generate_tts/.test(block.name ?? "")) {
        spoke = true;
      }
      if (
        block.type === "tool_use" &&
        block.name === "Bash" &&
        SPOKE_RE.test(block.input?.command ?? "")
      ) {
        spoke = true;
      }
      if (block.type === "text") visibleChars += (block.text ?? "").length;
    }
  }

  if (spoke || visibleChars < MIN_SUBSTANTIVE_CHARS) allow();

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        'Spoken-summary rule: this turn ended without speaking. Run: sayeth "<spoken summary, no more than 400 chars>". It wraps the local macOS `say` voice — free, offline, no budget applies. Write the summary deliberately; never pipe a full response, code, or file listings into it.',
    })
  );
}
