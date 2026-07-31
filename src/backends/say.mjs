// macOS `say` — the default backend. Local, free, offline, no account, no cap.
//
// Voice quality is entirely down to what the user has installed. macOS ships
// base voices, which sound robotic; Enhanced and Premium variants are a free
// download in System Settings and sound dramatically better. We auto-pick the
// best installed English voice, so a later download is picked up with no config
// change.

import { spawn } from 'node:child_process'
import { renderPauses, escapeSpeechCommands } from '../text.mjs'

export const name = 'say'
export const label = 'macOS say'

const TIERS = ['Premium', 'Enhanced'] // best first

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited ${code}`)),
    )
  })
}

/**
 * Parse one line of `say -v '?'`.
 *
 *   Samantha            en_US    # Hello! My name is Samantha.
 *   Samantha (Enhanced) en_US    # Hello! My name is Samantha.
 *   Majed               ar_001   # مرحبا
 *
 * The name column pads to 20 chars, but a name of 19+ collapses the gap to a
 * SINGLE space — and "Samantha (Enhanced)" is exactly 19. So never key off the
 * column gap. Strip the sample text at the first '#', then take the last
 * whitespace-delimited token as the locale; everything before it is the name.
 */
export function parseVoiceLine(line) {
  const hash = line.indexOf('#')
  const left = (hash === -1 ? line : line.slice(0, hash)).trimEnd()
  const m = left.match(/^(.*?)\s+([A-Za-z]{2,3}[_-][A-Za-z0-9]{2,4})$/)
  if (!m) return null

  const voiceName = m[1].trim()
  if (!voiceName) return null

  const tier = TIERS.find((t) => voiceName.endsWith(`(${t})`)) ?? 'Base'
  return { name: voiceName, locale: m[2], tier }
}

export function parseVoiceList(stdout) {
  return stdout.split('\n').map(parseVoiceLine).filter(Boolean)
}

export function pickBest(voices, { lang = 'en' } = {}) {
  const inLang = voices.filter((v) => v.locale.toLowerCase().startsWith(lang.toLowerCase()))
  for (const tier of TIERS) {
    const hit = inLang.find((v) => v.tier === tier)
    if (hit) return hit.name
  }
  // Samantha is the least-bad base voice on a default macOS install.
  if (inLang.some((v) => v.name === 'Samantha')) return 'Samantha'
  return null // let `say` use the system default
}

export async function listVoices() {
  return parseVoiceList(await run('say', ['-v', '?']))
}

export async function resolveVoice(cfg) {
  if (cfg.say?.voice) return cfg.say.voice
  try {
    return pickBest(await listVoices())
  } catch {
    return null
  }
}

export async function check() {
  try {
    await run('say', ['-v', '?'])
    return { ok: true, status: 'executable available; speaker access unverified' }
  } catch {
    return { ok: false, reason: '`say` not found — this backend is macOS only.' }
  }
}

export async function speak(text, cfg) {
  const voice = await resolveVoice(cfg)

  // Escape the caller's text FIRST, then insert our own [[slnc]] commands — the
  // other order would escape the very commands we just added.
  const spoken = renderPauses(escapeSpeechCommands(text), {
    backend: 'say',
    pauseMs: cfg.pauseMs ?? 450,
  })

  const args = []
  if (voice) args.push('-v', voice)
  args.push('-r', String(cfg.say?.rate ?? 180), '--', spoken)
  await run('say', args)
  return { voice: voice ?? '<system default>', rate: cfg.say?.rate ?? 180 }
}

export async function describe(cfg) {
  const voice = await resolveVoice(cfg)
  return { voice: voice ?? '<system default>', rate: cfg.say?.rate ?? 180 }
}
