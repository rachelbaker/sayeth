import * as say from './say.mjs'
import * as elevenlabs from './elevenlabs.mjs'
import * as command from './command.mjs'

export const BACKENDS = { say, elevenlabs, command }
export const BACKEND_NAMES = Object.keys(BACKENDS)

export function getBackend(name) {
  const backend = BACKENDS[name]
  if (!backend) {
    throw new Error(`sayeth: unknown backend "${name}". Known: ${BACKEND_NAMES.join(', ')}`)
  }
  return backend
}
