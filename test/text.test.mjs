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
