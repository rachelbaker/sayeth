// `sayeth init` — write the agent instructions into the right file, so nobody
// has to copy a block out of a README and guess where it goes.
//
// The block is wrapped in HTML comment markers, which makes this idempotent:
// running init twice updates in place instead of appending a second copy, and a
// later version of sayeth can revise the instructions without the user hunting
// for what changed.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const BEGIN = '<!-- sayeth:begin -->'
export const END = '<!-- sayeth:end -->'

// This text lands in the agent's context on EVERY turn, so it is deliberately
// tight. Each line earns its tokens: the first prevents the worst failure
// (piping a whole response in), the second prevents the second-worst (parallel
// agents talking over each other), the third stops an agent from working around
// a mute it doesn't understand.
//
// The length guidance is derived from the user's configured maxChars rather than
// hardcoded, because truncation alone cannot make a line succinct — chopping a
// rambling sentence just yields a rambling fragment. Lowering the cap has to
// change what the agent WRITES, not only what survives.
export function lengthGuidance(maxChars) {
  if (!maxChars) return 'a sentence or two'
  if (maxChars <= 120) return `ONE short sentence, under ${maxChars} characters`
  if (maxChars <= 250) return `one sentence, under ${maxChars} characters`
  return `one or two sentences, under ${maxChars} characters`
}

export function instructions({ maxChars = 400, style = null, target = null } = {}) {
  const hostAudio = target === 'codex'
    ? '\n- In Codex, run `sayeth` with direct host-audio access\n' +
      '  (`sandbox_permissions: "require_escalated"`). A sandboxed call can exit 0 while remaining inaudible.'
    : ''

  // The user's own guidance goes LAST, so it wins any argument with the
  // defaults above — it is the more specific instruction and they wrote it on
  // purpose.
  const custom = style ? `\n- ${String(style).trim()}` : ''

  return `## Spoken output

After finishing a substantive task, speak a summary aloud — ${lengthGuidance(maxChars)}:

    sayeth "Two things need you. // One, approve the migration. // Two, the staging key expires Friday. // Everything else passed."

- \`//\` becomes a short spoken pause. A listener has no headings or bullets, so
  pauses are the only structure available to you.
- Anything the user must DO comes first: count them, then one per pause, as
  above. What merely happened comes after. If nothing needs them, say so.
- \`sayeth\` speaks exactly what you pass it. It does not summarize; it truncates,
  keeping the FIRST ${maxChars || 400} characters — so pass a line you wrote, never a whole
  response, code, tables, or file listings.
- One call per reply. Never inside a loop, a subagent, or a background job.
- If the user wants quiet: \`sayeth mute 30m\` (or \`sayeth mute\`, \`sayeth unmute\`).
  While muted it is a silent no-op that still exits 0 — keep calling it normally.${hostAudio}${custom}`
}

/** Default block, for callers that don't care about config. */
export const INSTRUCTIONS = instructions()

export const TARGETS = {
  codex: { label: 'Codex', file: 'AGENTS.md' },
  claude: { label: 'Claude Code', file: 'CLAUDE.md' },
  cursor: { label: 'Cursor', file: '.cursorrules' },
  windsurf: { label: 'Windsurf', file: '.windsurfrules' },
  aider: { label: 'Aider', file: 'CONVENTIONS.md' },
  zed: { label: 'Zed', file: 'AGENTS.md' },
  agents: { label: 'AGENTS.md', file: 'AGENTS.md' },
}

export const TARGET_NAMES = Object.keys(TARGETS)

/**
 * Which agent is this project set up for? Decided by which instructions file
 * already exists — never by guessing at what's installed on the machine.
 * Order matters: the more specific filenames win over the generic AGENTS.md.
 */
export function detectTarget(cwd = process.cwd()) {
  const order = ['cursor', 'windsurf', 'aider', 'claude', 'agents']
  for (const name of order) {
    if (existsSync(join(cwd, TARGETS[name].file))) {
      return { name, ...TARGETS[name], existed: true }
    }
  }
  // Nothing found: AGENTS.md is the cross-tool convention, so create that.
  return { name: 'agents', ...TARGETS.agents, existed: false }
}

export function block(text = INSTRUCTIONS) {
  return `${BEGIN}\n${text}\n${END}`
}

/**
 * Returns the new file contents plus what happened, without touching disk —
 * so the caller can report accurately and tests don't need a filesystem.
 */
export function applyBlock(existing, text = INSTRUCTIONS) {
  const fresh = block(text)

  const start = existing.indexOf(BEGIN)
  const end = existing.indexOf(END)

  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start)
    const after = existing.slice(end + END.length)
    const next = before + fresh + after
    return { contents: next, action: next === existing ? 'unchanged' : 'updated' }
  }

  // A hand-pasted copy from the README won't have markers. Don't duplicate it.
  if (existing.includes('sayeth "') && existing.includes('## Spoken output')) {
    return { contents: existing, action: 'already-present' }
  }

  const sep = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  return { contents: existing + sep + fresh + '\n', action: existing ? 'appended' : 'created' }
}

export function runInit({ cwd = process.cwd(), target = null, file = null, text = null } = {}) {
  const chosen = target
    ? { name: target, ...TARGETS[target], existed: false }
    : detectTarget(cwd)

  const path = file ? (file.startsWith('/') ? file : join(cwd, file)) : join(cwd, chosen.file)
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const { contents, action } = applyBlock(existing, text ?? INSTRUCTIONS)

  if (action !== 'unchanged' && action !== 'already-present') {
    writeFileSync(path, contents)
  }
  return { path, action, target: chosen.name, label: chosen.label }
}
