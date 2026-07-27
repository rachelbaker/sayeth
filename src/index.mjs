// Programmatic API, for embedding outloud in a hook or another tool.
//
//   import { speak } from 'outloud'
//   await speak('Deploy verified.')

import { loadConfig } from './config.mjs'
import { getBackend } from './backends/index.mjs'
import { trimToSpoken } from './text.mjs'

export { loadConfig, configPath, DEFAULTS } from './config.mjs'
export { BACKEND_NAMES, getBackend } from './backends/index.mjs'
export { trimToSpoken, normalize } from './text.mjs'

export async function speak(text, { flags = {}, env, configFile } = {}) {
  const cfg = loadConfig({ flags, env, ...(configFile ? { path: configFile } : {}) })
  const backend = getBackend(cfg.backend)
  const spoken = trimToSpoken(text, cfg.maxChars)
  if (!spoken) throw new Error('outloud: nothing to say.')
  return { text: spoken, backend: cfg.backend, ...(await backend.speak(spoken, cfg)) }
}
