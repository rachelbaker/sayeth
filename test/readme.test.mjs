// The README documents a reference surface that lives in code. Every one of
// these checks corresponds to something that HAD already drifted: the settable
// keys were missing `style` and `pauseMs`, the environment table was missing
// three variables, and a hardcoded "54 tests" outlived the suite more than
// doubling. Prose can be stale; a table that contradicts the code is a bug.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SETTABLE, DEFAULTS } from '../src/config.mjs'

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const CONFIG_SRC = readFileSync(new URL('../src/config.mjs', import.meta.url), 'utf8')

test('every settable config key is documented', () => {
  const missing = [...SETTABLE].filter((k) => !README.includes('`' + k + '`'))
  assert.deepEqual(missing, [], 'undocumented config keys')
})

test('every environment variable the code reads is documented', () => {
  const envs = [...new Set(CONFIG_SRC.match(/env\.[A-Z_]+/g) ?? [])]
    .map((s) => s.slice(4))
    .filter((s) => s !== 'XDG_CONFIG_HOME')
  const missing = envs.filter((e) => !README.includes(e))
  assert.deepEqual(missing, [], 'undocumented environment variables')
})

test('documented defaults match the real defaults', () => {
  for (const [key, value] of [
    ['maxChars', DEFAULTS.maxChars],
    ['pauseMs', DEFAULTS.pauseMs],
    ['say.rate', DEFAULTS.say.rate],
  ]) {
    assert.ok(
      README.includes(`| \`${key}\` | \`${value}\` |`),
      `README should state ${key} defaults to ${value}`,
    )
  }
  assert.ok(README.includes(`\`${DEFAULTS.elevenlabs.modelId}\``), 'default model should be named')
})

test('no hardcoded test count, which cannot help but go stale', () => {
  assert.ok(!/\b\d+ tests\b/.test(README), 'README should not quote a test count')
})

test('internal anchors all resolve to real headings', () => {
  const links = [...new Set((README.match(/\]\(#[a-z0-9-]+\)/g) ?? []).map((s) => s.slice(3, -1)))]
  const slugs = new Set(
    (README.match(/^#+ .+$/gm) ?? []).map((h) =>
      h
        .replace(/^#+\s*/, '')
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/ /g, '-'),
    ),
  )
  const broken = links.filter((l) => !slugs.has(l))
  assert.deepEqual(broken, [], 'broken in-page links')
})
