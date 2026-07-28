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
export const INSTRUCTIONS = `## Spoken output

After finishing a substantive task, speak a one-or-two-sentence summary:

    sayeth "Deploy verified. All routes healthy."

- Write that line deliberately. \`sayeth\` speaks exactly what you pass it — it is
  a voice, not a summarizer, and it keeps only the FIRST 400 characters. Piping a
  full response in means the user hears your preamble and never hears the result.
  Never read code, tables, or file listings aloud.
- One call per reply. Never inside a loop, a subagent, or a background job.
- If the user wants quiet: \`sayeth mute 30m\` (or \`sayeth mute\`, \`sayeth unmute\`).
  While muted it is a silent no-op that still exits 0 — keep calling it normally
  rather than working around it.`

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

export function block(instructions = INSTRUCTIONS) {
  return `${BEGIN}\n${instructions}\n${END}`
}

/**
 * Returns the new file contents plus what happened, without touching disk —
 * so the caller can report accurately and tests don't need a filesystem.
 */
export function applyBlock(existing, instructions = INSTRUCTIONS) {
  const fresh = block(instructions)

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

export function runInit({ cwd = process.cwd(), target = null, file = null } = {}) {
  const chosen = target
    ? { name: target, ...TARGETS[target], existed: false }
    : detectTarget(cwd)

  const path = file ? (file.startsWith('/') ? file : join(cwd, file)) : join(cwd, chosen.file)
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const { contents, action } = applyBlock(existing)

  if (action !== 'unchanged' && action !== 'already-present') {
    writeFileSync(path, contents)
  }
  return { path, action, target: chosen.name, label: chosen.label }
}
