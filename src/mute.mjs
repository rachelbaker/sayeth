// Muting is transient state, not configuration, so it lives in its own file
// beside the config rather than inside it. Nothing here should show up in
// `config show` or end up committed to someone's dotfiles.
//
// The file holds either the literal string `forever` or an ISO timestamp to
// mute until. A timed mute expires on its own — the next read past the deadline
// deletes the file, so a forgotten `sayeth mute 30m` never silences anyone
// permanently.

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { configPath } from './config.mjs'

/** Longest allowed timed mute. Beyond this, ask for `sayeth mute` (indefinite). */
export const MAX_MUTE_MS = 30 * 24 * 60 * 60 * 1000

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

// Longest unit spellings first, so "30min" matches "min" rather than "m"
// leaving a dangling "in".
const DURATION_RE =
  /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|s|m|h|d)/g

export function mutePath() {
  return join(dirname(configPath()), 'mute')
}

/**
 * "30m" | "2h" | "90s" | "1h30m" | "45" (bare number = minutes) -> milliseconds.
 * Returns null if the input isn't fully understood, so a typo can never be
 * silently rounded into the wrong duration.
 */
export function parseDuration(input) {
  const s = String(input ?? '').trim().toLowerCase()
  if (!s) return null

  if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s) * UNITS.m)

  const matches = [...s.matchAll(DURATION_RE)]
  if (!matches.length) return null

  // Anything left over means we didn't understand the whole string.
  if (s.replace(DURATION_RE, '').replace(/[\s,]|and/g, '')) return null

  let total = 0
  for (const m of matches) total += Number(m[1]) * UNITS[m[2][0]]
  return Math.round(total)
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = []
  if (d) parts.push(plural(d, 'day'))
  if (h) parts.push(plural(h, 'hour'))
  if (m) parts.push(plural(m, 'minute'))
  // Only bother with seconds when that's the whole story.
  if (s && !d && !h) parts.push(plural(s, 'second'))

  return parts.join(' ') || '0 seconds'
}

/**
 * Current mute state. Self-healing: an expired or corrupt file is removed and
 * reported as not-muted rather than left to confuse the next caller.
 */
export function readMute({ now = Date.now(), path = mutePath() } = {}) {
  if (!existsSync(path)) return { muted: false }

  let raw
  try {
    raw = readFileSync(path, 'utf8').trim()
  } catch {
    return { muted: false }
  }
  if (!raw) return { muted: false }
  if (raw === 'forever') return { muted: true, forever: true }

  const until = Date.parse(raw)
  if (Number.isNaN(until)) {
    clearMute({ path })
    return { muted: false }
  }
  if (until <= now) {
    clearMute({ path })
    return { muted: false, expired: true }
  }
  return { muted: true, forever: false, until: new Date(until), remainingMs: until - now }
}

/** Pass null for an indefinite mute. */
export function setMute(ms, { now = Date.now(), path = mutePath() } = {}) {
  mkdirSync(dirname(path), { recursive: true })
  if (ms == null) {
    writeFileSync(path, 'forever\n')
    return { forever: true }
  }
  const until = new Date(now + ms)
  writeFileSync(path, until.toISOString() + '\n')
  return { forever: false, until }
}

export function clearMute({ path = mutePath() } = {}) {
  try {
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

/** One-line human description, used by `--check` and the mute/unmute commands. */
export function describeMute(state) {
  if (!state.muted) return 'no'
  if (state.forever) return 'indefinitely (sayeth unmute to turn it back on)'
  return `${formatDuration(state.remainingMs)} remaining, until ${state.until.toLocaleString()}`
}
