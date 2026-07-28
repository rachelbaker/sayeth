import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trimToSpoken, normalize } from '../src/text.mjs'

test('collapses whitespace and newlines', () => {
  assert.equal(normalize('  a\n\n b\tc  '), 'a b c')
})

test('leaves short text alone', () => {
  assert.equal(trimToSpoken('Deploy verified.', 400), 'Deploy verified.')
})

test('cuts at the last sentence boundary inside the budget', () => {
  const text = 'One sentence here. Two sentence here. And a third that overflows the budget.'
  assert.equal(trimToSpoken(text, 40), 'One sentence here. Two sentence here.')
})

test('falls back to a word boundary with an ellipsis', () => {
  const text = 'a'.repeat(10) + ' ' + 'b'.repeat(10) + ' ' + 'c'.repeat(50)
  const out = trimToSpoken(text, 25)
  assert.ok(out.endsWith('…'), out)
  assert.ok(!out.includes('ccc'), 'must not cut mid-word')
})

test('never returns more than the budget, ellipsis aside', () => {
  const out = trimToSpoken('word '.repeat(300), 100)
  assert.ok(out.length <= 101, `got ${out.length}`)
})

test('handles a single unbroken token longer than the budget', () => {
  assert.equal(trimToSpoken('x'.repeat(50), 10), 'x'.repeat(10) + '…')
})

test('maxChars of 0 disables trimming', () => {
  const long = 'y'.repeat(1000)
  assert.equal(trimToSpoken(long, 0), long)
})

test('empty and nullish input normalize to empty string', () => {
  assert.equal(trimToSpoken('', 400), '')
  assert.equal(trimToSpoken(null, 400), '')
  assert.equal(trimToSpoken(undefined, 400), '')
})

// --- pauses and speech-command safety ---------------------------------------

import { renderPauses, escapeSpeechCommands, hasPause, PAUSE_MARKER } from '../src/text.mjs'

test('text without a marker is returned untouched', () => {
  assert.equal(renderPauses('Deploy verified.'), 'Deploy verified.')
  assert.equal(hasPause('Deploy verified.'), false)
})

test('say gets real silence commands at each marker', () => {
  const out = renderPauses('Two things need you. // One, approve it. // Two, rotate the key.', {
    backend: 'say',
    pauseMs: 450,
  })
  assert.equal(
    out,
    'Two things need you. [[slnc 450]] One, approve it. [[slnc 450]] Two, rotate the key.',
  )
})

test('pause length is configurable', () => {
  assert.match(renderPauses('a // b', { backend: 'say', pauseMs: 900 }), /\[\[slnc 900\]\]/)
})

test('other backends get sentence breaks, never engine-specific markup', () => {
  // A literal [[slnc]] sent to ElevenLabs would be read out loud.
  const out = renderPauses('Two things need you. // One, approve it', { backend: 'elevenlabs' })
  assert.equal(out, 'Two things need you. One, approve it.')
  assert.ok(!out.includes('slnc'))
})

test('sentence breaks are not doubled up', () => {
  assert.equal(renderPauses('Done. // Ready.', { backend: 'elevenlabs' }), 'Done. Ready.')
  assert.equal(renderPauses('Done! // Ready?', { backend: 'elevenlabs' }), 'Done! Ready?')
})

test('stray or repeated markers do not produce empty segments', () => {
  assert.equal(renderPauses('// a // // b //', { backend: 'say', pauseMs: 100 }), 'a [[slnc 100]] b')
  assert.equal(renderPauses('//', { backend: 'say' }), '')
})

test('whitespace around a marker is absorbed', () => {
  assert.equal(renderPauses('a//b', { backend: 'say', pauseMs: 1 }), 'a [[slnc 1]] b')
  assert.equal(renderPauses('a   //   b', { backend: 'say', pauseMs: 1 }), 'a [[slnc 1]] b')
})

test('double brackets in agent text are escaped, not swallowed', () => {
  // Verified against real `say`: "the array index [[0]] bug" loses the index
  // entirely, because [[...]] is an embedded speech command.
  assert.equal(escapeSpeechCommands('the array index [[0]] bug'), 'the array index [ [0]] bug')
  assert.equal(escapeSpeechCommands('no brackets here'), 'no brackets here')
})

test('escaping runs before our own commands are inserted', () => {
  // Otherwise we would escape the [[slnc]] we just added and speak it aloud.
  const out = renderPauses(escapeSpeechCommands('index [[0]] fixed // tests pass'), {
    backend: 'say',
    pauseMs: 300,
  })
  assert.match(out, /\[\[slnc 300\]\]/, 'our pause command must survive')
  assert.ok(!out.includes('[[0]]'), "the caller's brackets must be defused")
})

test('the marker is the documented one', () => {
  assert.equal(PAUSE_MARKER, '//')
})

test('pauseMs 0 disables pauses instead of emitting a zero-length command', () => {
  assert.equal(renderPauses('a // b', { backend: 'say', pauseMs: 0 }), 'a b')
  assert.equal(renderPauses('a // b', { backend: 'elevenlabs', pauseMs: 0 }), 'a b')
  assert.ok(!renderPauses('a // b', { backend: 'say', pauseMs: 0 }).includes('slnc'))
})
