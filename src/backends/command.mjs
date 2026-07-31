// A user-supplied command — the escape hatch that covers every local TTS engine
// at once: Piper, Kokoro, Chatterbox, espeak-ng, or a script someone wrote this
// morning. One backend instead of one per engine means nothing here breaks when
// an upstream project renames a flag, and sayeth takes on no dependency and no
// licence entanglement, because the user chooses what to install.
//
// SECURITY: the text is written by a model, so it must never reach the shell.
// There is deliberately no {{text}} placeholder — text goes in via stdin, always.
// A summary containing backticks or $(...) is therefore inert. {{voice}} IS
// substituted, because it comes from the user's own config, not from an agent.

import { spawn } from 'node:child_process'
import { renderPauses } from '../text.mjs'

export const name = 'command'
export const label = 'custom command'
export const metered = false

/** First token of the pipeline — what we can plausibly check for on PATH. */
export function commandName(shell) {
  const first = String(shell ?? '').trim().split(/\s+/)[0] ?? ''
  // Strip a leading VAR=value, which some templates use.
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(first)
    ? String(shell).trim().split(/\s+/)[1] ?? ''
    : first
}

export function buildShell(cfg) {
  const shell = cfg.command?.shell
  if (!shell) {
    const err = new Error(
      'sayeth: no command configured.\n' +
        '  Set the pipeline that speaks stdin, for example:\n' +
        '    sayeth config set command.shell "piper -m {{voice}} --output-raw | afplay -"\n' +
        '  Then point command.voice at your model.',
    )
    err.name = 'NoCommandError'
    throw err
  }
  const voice = cfg.command?.voice ?? ''
  return shell.replaceAll('{{voice}}', voice)
}

export async function check(cfg) {
  let resolved
  try {
    resolved = buildShell(cfg)
  } catch (err) {
    return { ok: false, reason: err.message }
  }

  const bin = commandName(resolved)
  if (!bin) return { ok: false, reason: 'sayeth: command.shell is empty.' }

  const found = await new Promise((resolve) => {
    const probe = spawn('sh', ['-c', `command -v ${JSON.stringify(bin)}`], { stdio: 'ignore' })
    probe.on('error', () => resolve(false))
    probe.on('close', (code) => resolve(code === 0))
  })

  return found
    ? { ok: true }
    : {
        ok: false,
        reason: `sayeth: \`${bin}\` is not on PATH. Install it, or fix command.shell.`,
      }
}

/**
 * Nothing to enumerate — this is someone else's engine. Returning [] rather than
 * guessing keeps `--list` honest.
 */
export async function listVoices() {
  return []
}

export async function describe(cfg) {
  let bin = '<unset>'
  try {
    bin = commandName(buildShell(cfg)) || '<unset>'
  } catch {
    /* unconfigured — reported by check() */
  }
  // Deliberately not keyed "command": the backend is already named command, and
  // two lines both reading "command:" look contradictory in --check output.
  return { voice: cfg.command?.voice ?? '<none>', runs: bin }
}

export async function speak(text, cfg) {
  const resolved = buildShell(cfg)
  const spoken = renderPauses(text, { backend: 'command', pauseMs: cfg.pauseMs ?? 450 })

  await new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', resolved], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `sayeth: command exited ${code}. ${stderr.trim()}`.trim() +
                `\n  Command: ${resolved}`,
            ),
          ),
    )
    child.stdin.on('error', () => {}) // engine closed stdin early; not our problem
    child.stdin.end(spoken)
  })

  return { voice: cfg.command?.voice ?? '<none>', runs: commandName(resolved) }
}
