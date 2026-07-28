// Spoken output is a TLDR, not a transcript. Collapse whitespace, then cap
// length at a sentence boundary so it never stops mid-thought — falling back to
// a word boundary so it never stops mid-word.

export function normalize(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * `//` in a spoken line means "pause here". A listener has no headings, no
 * bullets and no whitespace — a beat of silence is the only structure available,
 * and it is what separates "you have two action items" from item one.
 */
export const PAUSE_MARKER = '//'
const PAUSE_SPLIT = /\s*\/\/\s*/

export function hasPause(text) {
  return PAUSE_SPLIT.test(String(text ?? ''))
}

/**
 * macOS `say` reads [[...]] as embedded speech commands, so agent text
 * containing double brackets is silently EATEN rather than spoken: "the array
 * index [[0]] bug" loses the index entirely. Break the sequence so it reads as
 * text. Must run before we insert our own [[slnc]] commands.
 */
export function escapeSpeechCommands(text) {
  return String(text ?? '').replace(/\[\[/g, '[ [')
}

/**
 * Render pause markers for a backend. `say` gets real silence. Anything else
 * gets a sentence break, which every engine renders as a short pause — safer
 * than engine-specific markup, which risks being read aloud verbatim.
 */
export function renderPauses(text, { backend = 'say', pauseMs = 450 } = {}) {
  const parts = String(text ?? '')
    .split(PAUSE_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length <= 1) return parts[0] ?? ''

  // pauseMs 0 means "no pauses" — drop the markers entirely rather than emitting
  // a zero-length silence command, so the setting does what it says.
  if (!pauseMs || pauseMs <= 0) return parts.join(' ')

  if (backend === 'say') return parts.join(` [[slnc ${pauseMs}]] `)
  return parts.map((p) => (/[.!?…]$/.test(p) ? p : p + '.')).join(' ')
}

export function trimToSpoken(text, maxChars) {
  const t = normalize(text)
  if (!maxChars || t.length <= maxChars) return t

  const cut = t.slice(0, maxChars)

  // Greedy: the LAST sentence end inside the budget, so we keep as much as fits.
  const sentence = cut.match(/^([\s\S]*[.!?])\s/)
  if (sentence) return sentence[1]

  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) + '…' : cut + '…'
}
