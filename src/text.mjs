// Spoken output is a TLDR, not a transcript. Collapse whitespace, then cap
// length at a sentence boundary so it never stops mid-thought — falling back to
// a word boundary so it never stops mid-word.

export function normalize(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
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
