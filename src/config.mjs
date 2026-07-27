// Config precedence, highest first: CLI flags > env vars > config file > defaults.
//
// The file lives at $XDG_CONFIG_HOME/outloud/config.json (default ~/.config).
// An API key may live there, so it is written 0600 — but the env var is the
// better home for it and always wins.

import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs'

export const DEFAULTS = {
  backend: 'say',
  maxChars: 400,
  say: {
    voice: null, // null = auto-pick the best installed English voice
    rate: 180, // wpm; <150 sounds sedated, >220 gets choppy
  },
  elevenlabs: {
    apiKey: null,
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    modelId: 'eleven_flash_v2_5', // ~half the per-character cost of the full model
    stability: 0.5,
    similarityBoost: 0.75,
  },
}

export const SETTABLE = new Set([
  'backend',
  'maxChars',
  'say.voice',
  'say.rate',
  'elevenlabs.apiKey',
  'elevenlabs.voiceId',
  'elevenlabs.modelId',
  'elevenlabs.stability',
  'elevenlabs.similarityBoost',
])

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'outloud', 'config.json')
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge(base, override) {
  const out = { ...base }
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === undefined) continue
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v
  }
  return out
}

export function readConfigFile(path = configPath()) {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`outloud: ${path} is not valid JSON (${err.message})`)
  }
}

export function writeConfigFile(cfg, path = configPath()) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
  chmodSync(path, 0o600) // enforce even if the file already existed
  return path
}

function fromEnv(env) {
  // An exported-but-empty var (`export OUTLOUD_BACKEND=` in a shell profile) is
  // unset, not a value — otherwise it clobbers the config file with "".
  const str = (v) => (v === undefined || v === '' ? undefined : v)
  const num = (v) => (str(v) === undefined || Number.isNaN(Number(v)) ? undefined : Number(v))
  return prune({
    backend: str(env.OUTLOUD_BACKEND),
    maxChars: num(env.OUTLOUD_MAX_CHARS),
    say: prune({ voice: str(env.OUTLOUD_VOICE), rate: num(env.OUTLOUD_RATE) }),
    elevenlabs: prune({
      apiKey: str(env.ELEVENLABS_API_KEY) ?? str(env.OUTLOUD_ELEVENLABS_API_KEY),
      voiceId: str(env.OUTLOUD_ELEVENLABS_VOICE_ID),
      modelId: str(env.OUTLOUD_ELEVENLABS_MODEL_ID),
    }),
  })
}

// Drop undefined/empty branches so they never clobber a lower-precedence value.
function prune(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (isPlainObject(v) && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** flags is the shape produced by the CLI parser: { backend, voice, rate, maxChars } */
export function loadConfig({ flags = {}, env = process.env, path = configPath() } = {}) {
  const merged = deepMerge(deepMerge(DEFAULTS, readConfigFile(path)), fromEnv(env) ?? {})

  return deepMerge(merged, {
    backend: flags.backend,
    maxChars: flags.maxChars,
    say: prune({ voice: flags.voice, rate: flags.rate }),
    // --voice on the elevenlabs backend means the voice id
    elevenlabs: prune({ voiceId: flags.backend === 'elevenlabs' ? flags.voice : undefined }),
  })
}

export function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

export function setPath(obj, dotted, value) {
  const keys = dotted.split('.')
  const last = keys.pop()
  let node = obj
  for (const k of keys) {
    if (!isPlainObject(node[k])) node[k] = {}
    node = node[k]
  }
  node[last] = value
  return obj
}

/** Turn a CLI string into the type DEFAULTS says the key should be. */
export function coerce(dotted, raw) {
  const expected = getPath(DEFAULTS, dotted)
  if (raw === 'null') return null
  if (typeof expected === 'number') {
    const n = Number(raw)
    if (Number.isNaN(n)) throw new Error(`outloud: ${dotted} must be a number, got "${raw}"`)
    return n
  }
  return raw
}
