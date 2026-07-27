import * as say from './say.mjs'
import * as elevenlabs from './elevenlabs.mjs'

export const BACKENDS = { say, elevenlabs }
export const BACKEND_NAMES = Object.keys(BACKENDS)

export function getBackend(name) {
  const backend = BACKENDS[name]
  if (!backend) {
    throw new Error(`sayeth: unknown backend "${name}". Known: ${BACKEND_NAMES.join(', ')}`)
  }
  return backend
}
