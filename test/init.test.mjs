import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyBlock, detectTarget, runInit, block, INSTRUCTIONS, BEGIN, END, TARGETS,
} from '../src/init.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'sayeth-init-'))

test('creates the file when nothing exists', () => {
  const cwd = dir()
  const r = runInit({ cwd })
  assert.equal(r.action, 'created')
  assert.equal(r.path, join(cwd, 'AGENTS.md'), 'AGENTS.md is the cross-tool default')
  const body = readFileSync(r.path, 'utf8')
  assert.ok(body.includes(BEGIN) && body.includes(END))
  assert.ok(body.includes('sayeth "Deploy verified'))
})

test('appends to an existing file without destroying it', () => {
  const cwd = dir()
  writeFileSync(join(cwd, 'AGENTS.md'), '# My project\n\nExisting rules here.\n')
  const r = runInit({ cwd })
  assert.equal(r.action, 'appended')
  const body = readFileSync(r.path, 'utf8')
  assert.ok(body.startsWith('# My project'), 'existing content must survive')
  assert.ok(body.includes('Existing rules here.'))
  assert.ok(body.includes(BEGIN))
})

test('running init twice does not duplicate the block', () => {
  // The whole point of the markers.
  const cwd = dir()
  runInit({ cwd })
  const first = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')

  const second = runInit({ cwd })
  assert.equal(second.action, 'unchanged')
  assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), first)

  const occurrences = first.split(BEGIN).length - 1
  assert.equal(occurrences, 1)
})

test('a newer instruction block replaces the old one in place', () => {
  const existing = `# Rules\n\n${BEGIN}\nold and outdated\n${END}\n\nMore rules.\n`
  const { contents, action } = applyBlock(existing, 'brand new instructions')
  assert.equal(action, 'updated')
  assert.ok(contents.includes('brand new instructions'))
  assert.ok(!contents.includes('old and outdated'))
  assert.ok(contents.startsWith('# Rules'), 'content before the block survives')
  assert.ok(contents.trimEnd().endsWith('More rules.'), 'content after it survives')
  assert.equal(contents.split(BEGIN).length - 1, 1)
})

test('a hand-pasted copy is detected and left alone', () => {
  // Someone who copied from the README has no markers. Appending would give
  // them the instructions twice.
  const existing = '# Rules\n\n## Spoken output\n\n    sayeth "Deploy verified."\n'
  const { contents, action } = applyBlock(existing)
  assert.equal(action, 'already-present')
  assert.equal(contents, existing)
})

test('detects the agent from the file already in the project', () => {
  for (const [name, t] of Object.entries({
    cursor: TARGETS.cursor, windsurf: TARGETS.windsurf, aider: TARGETS.aider, claude: TARGETS.claude,
  })) {
    const cwd = dir()
    writeFileSync(join(cwd, t.file), '# existing\n')
    assert.equal(detectTarget(cwd).name, name, `${t.file} should detect as ${name}`)
  }
})

test('a specific filename beats the generic AGENTS.md', () => {
  const cwd = dir()
  writeFileSync(join(cwd, 'AGENTS.md'), '')
  writeFileSync(join(cwd, '.cursorrules'), '')
  assert.equal(detectTarget(cwd).name, 'cursor')
})

test('falls back to AGENTS.md when nothing is detectable', () => {
  const t = detectTarget(dir())
  assert.equal(t.name, 'agents')
  assert.equal(t.existed, false)
})

test('an explicit target overrides detection', () => {
  const cwd = dir()
  writeFileSync(join(cwd, '.cursorrules'), '')
  const r = runInit({ cwd, target: 'claude' })
  assert.equal(r.path, join(cwd, 'CLAUDE.md'))
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), true)
})

test('--file writes exactly where told', () => {
  const cwd = dir()
  const r = runInit({ cwd, file: 'nested-rules.md' })
  assert.equal(r.path, join(cwd, 'nested-rules.md'))
  assert.ok(readFileSync(r.path, 'utf8').includes(BEGIN))
})

test('spacing stays sane whatever the file ended with', () => {
  for (const [tail, label] of [['no newline', 'no trailing newline'], ['one\n', 'one newline'], ['two\n\n', 'two newlines']]) {
    const { contents } = applyBlock(tail)
    assert.ok(!/\n{3,}/.test(contents), `${label} should not produce a triple newline`)
    assert.ok(contents.includes(BEGIN))
  }
})

test('the block is valid markdown-ish and self-delimiting', () => {
  const b = block()
  assert.ok(b.startsWith(BEGIN))
  assert.ok(b.endsWith(END))
  assert.ok(b.includes(INSTRUCTIONS))
})

test('the instruction block stays short, since it is in context every turn', () => {
  // A guardrail, not a style rule: this text costs tokens on every single turn
  // of every session it is installed in.
  assert.ok(
    INSTRUCTIONS.length < 900,
    `instructions are ${INSTRUCTIONS.length} chars; keep them tight`,
  )
})

test('the block still carries the three things that actually prevent failures', () => {
  assert.match(INSTRUCTIONS, /FIRST 400/, 'must warn that trimming keeps the beginning')
  assert.match(INSTRUCTIONS, /One call per reply/, 'must prevent overlapping speech')
  assert.match(INSTRUCTIONS, /mute/, 'must stop agents working around a mute')
})
