// ElevenLabs — opt-in backend for when the local voice isn't good enough.
//
// Unlike `say`, every call here bills the user's account, so nothing in this
// module runs unless the backend is explicitly selected. Request building is
// exported separately from the network call so it can be tested without
// spending anyone's credits.

import { spawn } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderPauses } from '../text.mjs'

export const name = 'elevenlabs'
export const label = 'ElevenLabs'

const API = 'https://api.elevenlabs.io/v1'

class MissingKeyError extends Error {
  constructor() {
    super(
      'sayeth: no ElevenLabs API key.\n' +
        '  Set it in the environment (preferred):  export ELEVENLABS_API_KEY=...\n' +
        '  Or store it:                            sayeth config set elevenlabs.apiKey ...',
    )
    this.name = 'MissingKeyError'
  }
}

export function apiKey(cfg) {
  const key = cfg.elevenlabs?.apiKey
  if (!key) throw new MissingKeyError()
  return key
}

/** Built separately from the fetch so tests can assert on it without a network call. */
export function buildSpeechRequest(text, cfg) {
  const el = cfg.elevenlabs ?? {}
  // Pause markers become sentence breaks rather than engine-specific markup,
  // which would risk being read out verbatim.
  const spoken = renderPauses(text, { backend: 'elevenlabs', pauseMs: cfg.pauseMs ?? 450 })
  return {
    url: `${API}/text-to-speech/${encodeURIComponent(el.voiceId)}?output_format=mp3_44100_128`,
    init: {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey(cfg),
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: spoken,
        model_id: el.modelId,
        voice_settings: {
          stability: el.stability,
          similarity_boost: el.similarityBoost,
        },
      }),
    },
  }
}

async function assertOk(res) {
  if (res.ok) return
  let detail = ''
  try {
    detail = JSON.stringify(await res.json())
  } catch {
    detail = await res.text().catch(() => '')
  }
  const hint =
    res.status === 401
      ? ' — check ELEVENLABS_API_KEY'
      : res.status === 429
        ? ' — rate limited or out of credits'
        : ''
  throw new Error(`sayeth: ElevenLabs ${res.status}${hint}. ${detail}`.trim())
}

export async function listVoices(cfg, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}/voices`, { headers: { 'xi-api-key': apiKey(cfg) } })
  await assertOk(res)
  const body = await res.json()
  return (body.voices ?? []).map((v) => ({
    name: v.name,
    locale: v.labels?.accent ?? '—',
    tier: v.category ?? 'generated',
    id: v.voice_id,
  }))
}

export async function check(cfg) {
  if (!cfg.elevenlabs?.apiKey) return { ok: false, reason: new MissingKeyError().message }
  return { ok: true }
}

// Play through whatever the platform has. afplay ships with macOS; the others
// are common on Linux. We never leave the temp file behind.
const PLAYERS = [
  ['afplay', (f) => [f]],
  ['mpv', (f) => ['--really-quiet', f]],
  ['ffplay', (f) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f]],
  ['mpg123', (f) => ['-q', f]],
]

function playFile(file) {
  return new Promise((resolve, reject) => {
    const tryPlayer = (i) => {
      if (i >= PLAYERS.length) {
        return reject(
          new Error('sayeth: no audio player found (tried afplay, mpv, ffplay, mpg123).'),
        )
      }
      const [cmd, argsFor] = PLAYERS[i]
      const child = spawn(cmd, argsFor(file), { stdio: 'ignore' })
      child.on('error', () => tryPlayer(i + 1)) // not installed — try the next
      child.on('close', (code) => (code === 0 ? resolve(cmd) : tryPlayer(i + 1)))
    }
    tryPlayer(0)
  })
}

export async function speak(text, cfg, { fetchImpl = fetch } = {}) {
  const { url, init } = buildSpeechRequest(text, cfg)
  const res = await fetchImpl(url, init)
  await assertOk(res)

  const file = join(tmpdir(), `sayeth-${process.pid}-${Date.now()}.mp3`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  try {
    await playFile(file)
  } finally {
    await unlink(file).catch(() => {})
  }
  return { voice: cfg.elevenlabs.voiceId, model: cfg.elevenlabs.modelId, chars: text.length }
}

export async function describe(cfg) {
  return {
    voice: cfg.elevenlabs?.voiceId ?? '<unset>',
    model: cfg.elevenlabs?.modelId ?? '<unset>',
  }
}
