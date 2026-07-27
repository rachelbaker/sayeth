import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseDuration, formatDuration, readMute, setMute, clearMute, describeMute, MAX_MUTE_MS,
} from '../src/mute.mjs'

const tmpMute = () => join(mkdtempSync(join(tmpdir(), 'sayeth-mute-')), 'mute')

test('parses the common duration forms', () => {
  assert.equal(parseDuration('90s'), 90_000)
  assert.equal(parseDuration('30m'), 30 * 60_000)
  assert.equal(parseDuration('2h'), 2 * 3_600_000)
  assert.equal(parseDuration('1d'), 86_400_000)
})

test('parses long unit spellings without the "30min -> 30m + in" trap', () => {
  assert.equal(parseDuration('30min'), 30 * 60_000)
  assert.equal(parseDuration('30 minutes'), 30 * 60_000)
  assert.equal(parseDuration('2 hours'), 2 * 3_600_000)
  assert.equal(parseDuration('45 secs'), 45_000)
  assert.equal(parseDuration('3 days'), 3 * 86_400_000)
})

test('parses compound durations', () => {
  assert.equal(parseDuration('1h30m'), 90 * 60_000)
  assert.equal(parseDuration('1h 30m'), 90 * 60_000)
  assert.equal(parseDuration('1d2h'), 86_400_000 + 2 * 3_600_000)
})

test('a bare number means minutes', () => {
  assert.equal(parseDuration('45'), 45 * 60_000)
  assert.equal(parseDuration('1'), 60_000)
})

test('rejects anything it does not fully understand, rather than guessing', () => {
  // A typo must never be silently rounded into the wrong duration.
  assert.equal(parseDuration('30x'), null)
  assert.equal(parseDuration('half an hour'), null)
  assert.equal(parseDuration('30m please'), null)
  assert.equal(parseDuration('tomorrow'), null)
  assert.equal(parseDuration(''), null)
  assert.equal(parseDuration(null), null)
  assert.equal(parseDuration('m'), null)
})

test('formats durations readably', () => {
  assert.equal(formatDuration(60_000), '1 minute')
  assert.equal(formatDuration(120_000), '2 minutes')
  assert.equal(formatDuration(90 * 60_000), '1 hour 30 minutes')
  assert.equal(formatDuration(45_000), '45 seconds')
  assert.equal(formatDuration(86_400_000), '1 day')
  assert.equal(formatDuration(0), '0 seconds')
})

test('not muted when no file exists', () => {
  assert.equal(readMute({ path: tmpMute() }).muted, false)
})

test('a timed mute reports remaining time', () => {
  const path = tmpMute()
  const now = 1_000_000
  setMute(30 * 60_000, { now, path })

  const state = readMute({ now: now + 60_000, path })
  assert.equal(state.muted, true)
  assert.equal(state.forever, false)
  assert.equal(state.remainingMs, 29 * 60_000)
})

test('a timed mute expires on its own AND deletes its file', () => {
  // A forgotten `mute 30m` must never silence someone permanently.
  const path = tmpMute()
  const now = 1_000_000
  setMute(60_000, { now, path })
  assert.equal(readMute({ now: now + 59_000, path }).muted, true)

  const after = readMute({ now: now + 61_000, path })
  assert.equal(after.muted, false)
  assert.equal(after.expired, true)
  assert.equal(existsSync(path), false, 'the expired file should be cleaned up')
})

test('an indefinite mute does not expire', () => {
  const path = tmpMute()
  setMute(null, { path })
  const state = readMute({ now: Date.now() + 10 * 365 * 86_400_000, path })
  assert.equal(state.muted, true)
  assert.equal(state.forever, true)
})

test('a corrupt mute file heals instead of jamming', () => {
  const path = tmpMute()
  writeFileSync(path, 'not a timestamp\n')
  assert.equal(readMute({ path }).muted, false)
  assert.equal(existsSync(path), false)
})

test('an empty mute file is not a mute', () => {
  const path = tmpMute()
  writeFileSync(path, '\n')
  assert.equal(readMute({ path }).muted, false)
})

test('clearMute removes the mute, and is safe when there is none', () => {
  const path = tmpMute()
  setMute(60_000, { path })
  assert.equal(readMute({ path }).muted, true)
  clearMute({ path })
  assert.equal(readMute({ path }).muted, false)
  assert.doesNotThrow(() => clearMute({ path }))
})

test('describeMute gives a one-liner for each state', () => {
  assert.equal(describeMute({ muted: false }), 'no')
  assert.match(describeMute({ muted: true, forever: true }), /indefinitely/)
  assert.match(
    describeMute({ muted: true, forever: false, remainingMs: 5 * 60_000, until: new Date() }),
    /5 minutes remaining/,
  )
})

test('the 30-day ceiling is a real bound', () => {
  assert.equal(MAX_MUTE_MS, 30 * 86_400_000)
  assert.ok(parseDuration('31d') > MAX_MUTE_MS)
})
