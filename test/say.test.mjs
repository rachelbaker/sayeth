import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceLine, parseVoiceList, pickBest } from '../src/backends/say.mjs'

// Real `say -v '?'` output pads the name column to 20 chars.
const BASE = `Alex                en_US    # Most people recognize me by my voice.
Samantha            en_US    # Hello! My name is Samantha.
Anna                de_DE    # Hallo! Ich heiße Anna.
Kyoko               ja_JP    # こんにちは。`

test('parses a padded base line', () => {
  assert.deepEqual(parseVoiceLine('Samantha            en_US    # Hello!'), {
    name: 'Samantha',
    locale: 'en_US',
    tier: 'Base',
  })
})

test('parses a 19-char name, where the column gap collapses to ONE space', () => {
  // "Samantha (Enhanced)" is exactly 19 chars. This is the regression that
  // broke the original shell implementation.
  assert.deepEqual(parseVoiceLine('Samantha (Enhanced) en_US    # Hello!'), {
    name: 'Samantha (Enhanced)',
    locale: 'en_US',
    tier: 'Enhanced',
  })
})

test('parses a very long name with one space', () => {
  assert.equal(parseVoiceLine('Shelley (English (US)) en_US    # Hi').name, 'Shelley (English (US))')
})

test('tolerates numeric-region locales (Majed ar_001)', () => {
  assert.deepEqual(parseVoiceLine('Majed               ar_001   # مرحبا'), {
    name: 'Majed',
    locale: 'ar_001',
    tier: 'Base',
  })
})

test('sample text mentioning a locale does not confuse the parser', () => {
  const v = parseVoiceLine('Tom (Enhanced)      en_US    # I say en_GB and en_AU alike.')
  assert.equal(v.name, 'Tom (Enhanced)')
  assert.equal(v.locale, 'en_US')
})

test('ignores header/blank/garbage lines', () => {
  assert.equal(parseVoiceLine(''), null)
  assert.equal(parseVoiceLine('   '), null)
  assert.equal(parseVoiceLine('not a voice line'), null)
})

test('Premium beats Enhanced beats Samantha', () => {
  const voices = parseVoiceList(`${BASE}
Tom (Enhanced)      en_US    # Hello!
Ava (Premium)       en_US    # Hello!`)
  assert.equal(pickBest(voices), 'Ava (Premium)')
})

test('Enhanced wins when no Premium is installed', () => {
  const voices = parseVoiceList(`${BASE}\nTom (Enhanced)      en_US    # Hello!`)
  assert.equal(pickBest(voices), 'Tom (Enhanced)')
})

test('a non-English Premium voice is ignored', () => {
  const voices = parseVoiceList(`${BASE}\nFederica (Premium)  it_IT    # Ciao!`)
  assert.equal(pickBest(voices), 'Samantha')
})

test('en_GB and en_AU count as English', () => {
  const voices = parseVoiceList(`${BASE}\nSerena (Premium)    en_GB    # Hello!`)
  assert.equal(pickBest(voices), 'Serena (Premium)')
})

test('falls through to the system default when there is nothing good', () => {
  const voices = parseVoiceList('Alex                en_US    # Hi\nAnna                de_DE    # Hallo')
  assert.equal(pickBest(voices), null)
})

test('parses the real local voice list without throwing', async () => {
  const { listVoices } = await import('../src/backends/say.mjs')
  if (process.platform !== 'darwin') return
  const voices = await listVoices()
  assert.ok(voices.length > 0, 'expected at least one voice')
  // Every parsed voice must have a plausible name and locale.
  for (const v of voices) {
    assert.match(v.locale, /^[A-Za-z]{2,3}[_-][A-Za-z0-9]{2,4}$/)
    assert.ok(v.name.length > 0 && !v.name.includes('#'))
  }
})
