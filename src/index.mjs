// Programmatic API, for embedding sayeth in a hook or another tool.
//
//   import { speak } from 'sayeth'
//   await speak('Deploy verified.')

import { loadConfig } from './config.mjs'
import { getBackend } from './backends/index.mjs'
import { trimToSpoken } from './text.mjs'
import { readMute } from './mute.mjs'

export { loadConfig, configPath, DEFAULTS } from './config.mjs'
export { BACKEND_NAMES, getBackend } from './backends/index.mjs'
export { trimToSpoken, normalize } from './text.mjs'
export {
  readMute, setMute, clearMute, mutePath, parseDuration, formatDuration, describeMute,
} from './mute.mjs'

/**
 * Resolves to `{ spoke: false, muted: true }` without speaking when a mute is
 * active. A mute is the user's choice, not an error — don't throw, and don't
 * retry. Pass `{ ignoreMute: true }` only for something the user asked for in
 * the moment.
 */
export async function speak(text, { flags = {}, env, configFile, ignoreMute = false } = {}) {
  const cfg = loadConfig({ flags, env, ...(configFile ? { path: configFile } : {}) })
  const backend = getBackend(cfg.backend)
  const spoken = trimToSpoken(text, cfg.maxChars)
  if (!spoken) throw new Error('sayeth: nothing to say.')

  if (!ignoreMute && readMute().muted) {
    return { text: spoken, backend: cfg.backend, muted: true, spoke: false }
  }

  return {
    text: spoken,
    backend: cfg.backend,
    muted: false,
    spoke: true,
    ...(await backend.speak(spoken, cfg)),
  }
}
