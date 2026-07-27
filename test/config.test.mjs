import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, writeConfigFile, readConfigFile, coerce, DEFAULTS } from '../src/config.mjs'

function withFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'outloud-test-'))
  const path = join(dir, 'config.json')
  if (contents !== undefined) writeFileSync(path, JSON.stringify(contents))
  return path
}

test('defaults apply when there is no config file and no env', () => {
  const cfg = loadConfig({ env: {}, path: withFile(undefined) })
  assert.equal(cfg.backend, 'say')
  assert.equal(cfg.maxChars, 400)
  assert.equal(cfg.say.rate, 180)
})

test('config file overrides defaults, and merges deeply', () => {
  const path = withFile({ backend: 'elevenlabs', say: { rate: 220 } })
  const cfg = loadConfig({ env: {}, path })
  assert.equal(cfg.backend, 'elevenlabs')
  assert.equal(cfg.say.rate, 220)
  assert.equal(cfg.say.voice, null, 'untouched sibling keeps its default')
  assert.equal(cfg.elevenlabs.modelId, DEFAULTS.elevenlabs.modelId)
})

test('env overrides the config file', () => {
  const path = withFile({ backend: 'say', say: { rate: 220 } })
  const cfg = loadConfig({ env: { OUTLOUD_BACKEND: 'elevenlabs', OUTLOUD_RATE: '150' }, path })
  assert.equal(cfg.backend, 'elevenlabs')
  assert.equal(cfg.say.rate, 150)
})

test('flags override env', () => {
  const path = withFile({ backend: 'say' })
  const cfg = loadConfig({
    env: { OUTLOUD_BACKEND: 'elevenlabs', OUTLOUD_VOICE: 'Fred' },
    flags: { backend: 'say', voice: 'Kathy' },
    path,
  })
  assert.equal(cfg.backend, 'say')
  assert.equal(cfg.say.voice, 'Kathy')
})

test('ELEVENLABS_API_KEY is picked up from the environment', () => {
  const cfg = loadConfig({ env: { ELEVENLABS_API_KEY: 'sk-test' }, path: withFile(undefined) })
  assert.equal(cfg.elevenlabs.apiKey, 'sk-test')
})

test('empty env vars do not clobber config-file values', () => {
  const path = withFile({ say: { voice: 'Samantha' } })
  const cfg = loadConfig({ env: { OUTLOUD_VOICE: '', OUTLOUD_RATE: '' }, path })
  assert.equal(cfg.say.voice, 'Samantha')
  assert.equal(cfg.say.rate, 180)
})

test('--voice maps to the elevenlabs voice id on that backend', () => {
  const path = withFile(undefined)
  const cfg = loadConfig({ env: {}, flags: { backend: 'elevenlabs', voice: 'abc123' }, path })
  assert.equal(cfg.elevenlabs.voiceId, 'abc123')
})

test('the config file is written 0600 because it can hold an API key', () => {
  const path = withFile(undefined)
  writeConfigFile({ elevenlabs: { apiKey: 'sk-secret' } }, path)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(readConfigFile(path).elevenlabs.apiKey, 'sk-secret')
})

test('malformed JSON fails loudly rather than silently resetting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outloud-test-'))
  const path = join(dir, 'config.json')
  writeFileSync(path, '{ not json')
  assert.throws(() => readConfigFile(path), /not valid JSON/)
})

test('coerce respects the type implied by DEFAULTS', () => {
  assert.equal(coerce('say.rate', '200'), 200)
  assert.equal(coerce('backend', 'elevenlabs'), 'elevenlabs')
  assert.equal(coerce('say.voice', 'null'), null)
  assert.throws(() => coerce('say.rate', 'fast'), /must be a number/)
})
