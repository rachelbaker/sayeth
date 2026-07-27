// Every real call here bills the user's account, so these tests never touch the
// network — the request builder is exported precisely so it can be asserted on
// for free, and listVoices takes an injectable fetch.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSpeechRequest, listVoices, check } from '../src/backends/elevenlabs.mjs'
import { DEFAULTS } from '../src/config.mjs'

const cfg = (over = {}) => ({
  ...DEFAULTS,
  backend: 'elevenlabs',
  elevenlabs: { ...DEFAULTS.elevenlabs, apiKey: 'sk-test', ...over },
})

test('builds a correct speech request', () => {
  const { url, init } = buildSpeechRequest('hello', cfg({ voiceId: 'VOICE1' }))
  assert.match(url, /\/v1\/text-to-speech\/VOICE1\?/)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers['xi-api-key'], 'sk-test')

  const body = JSON.parse(init.body)
  assert.equal(body.text, 'hello')
  assert.equal(body.model_id, 'eleven_flash_v2_5', 'cheap model is the default')
})

test('voice ids are url-encoded', () => {
  const { url } = buildSpeechRequest('hi', cfg({ voiceId: 'a b/c' }))
  assert.ok(url.includes('a%20b%2Fc'), url)
})

test('a missing API key is an actionable error, not a crash', () => {
  const bare = { ...DEFAULTS, elevenlabs: { ...DEFAULTS.elevenlabs, apiKey: null } }
  assert.throws(() => buildSpeechRequest('hi', bare), /ELEVENLABS_API_KEY/)
})

test('check() reports not-ready without a key, and never throws', async () => {
  const bare = { ...DEFAULTS, elevenlabs: { ...DEFAULTS.elevenlabs, apiKey: null } }
  const res = await check(bare)
  assert.equal(res.ok, false)
  assert.match(res.reason, /config set elevenlabs.apiKey/)
  assert.equal((await check(cfg())).ok, true)
})

test('listVoices maps the API shape, using an injected fetch', async () => {
  const fetchImpl = async (url, init) => {
    assert.match(url, /\/v1\/voices$/)
    assert.equal(init.headers['xi-api-key'], 'sk-test')
    return {
      ok: true,
      json: async () => ({
        voices: [{ name: 'Rachel', voice_id: 'v1', category: 'premade', labels: { accent: 'american' } }],
      }),
    }
  }
  const voices = await listVoices(cfg(), { fetchImpl })
  assert.deepEqual(voices, [{ name: 'Rachel', locale: 'american', tier: 'premade', id: 'v1' }])
})

test('a 401 surfaces a key hint rather than a raw status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ detail: 'nope' }) })
  await assert.rejects(() => listVoices(cfg(), { fetchImpl }), /check ELEVENLABS_API_KEY/)
})

test('a 429 says rate-limited or out of credits', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) })
  await assert.rejects(() => listVoices(cfg(), { fetchImpl }), /out of credits/)
})
