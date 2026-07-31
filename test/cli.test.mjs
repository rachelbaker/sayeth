// End-to-end CLI tests. `say` is shimmed on PATH so these run anywhere and
// never make a sound.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(ROOT, 'src', 'cli.mjs')

const FIXTURE = `Alex                en_US    # Most people recognize me by my voice.
Samantha            en_US    # Hello! My name is Samantha.
Anna                de_DE    # Hallo!`

// A fake `say`: prints $FIXTURE for -v '?', and records how it was invoked to
// $SAY_LOG. Real `say` writes nothing to stdout, so the log is the only honest
// way to assert on the arguments it received.
const SHIM = mkdtempSync(join(tmpdir(), 'sayeth-shim-'))
writeFileSync(
  join(SHIM, 'say'),
  `#!/usr/bin/env bash
if [ "$1" = "-v" ] && [ "$2" = "?" ]; then printf '%s\\n' "$FIXTURE"; exit 0; fi
[ -n "$SAY_LOG" ] && printf 'SAY %s\\n' "$*" >> "$SAY_LOG"
exit 0
`,
  { mode: 0o755 },
)
chmodSync(join(SHIM, 'say'), 0o755)

const CONFIG_HOME = mkdtempSync(join(tmpdir(), 'sayeth-cfg-'))
let logSeq = 0

function run(args, { fixture = FIXTURE, stdin, env = {} } = {}) {
  const sayLog = join(SHIM, `invocations-${logSeq++}.log`)
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        env: {
          ...process.env,
          PATH: `${SHIM}:${process.env.PATH}`,
          XDG_CONFIG_HOME: CONFIG_HOME,
          FIXTURE: fixture,
          SAY_LOG: sayLog,
          SAYETH_BACKEND: '',
          SAYETH_VOICE: '',
          ...env,
        },
      },
      (err, stdout, stderr) => {
        let sayCalls = ''
        try {
          sayCalls = readFileSync(sayLog, 'utf8')
        } catch {
          sayCalls = ''
        }
        resolve({ code: err?.code ?? 0, stdout, stderr, sayCalls })
      },
    )
    if (stdin !== undefined) child.stdin.end(stdin)
    else child.stdin.end()
  })
}

test('--dry reports the auto-picked voice without speaking', async () => {
  const { stdout, code } = await run(['--dry', 'Deploy verified.'])
  assert.equal(code, 0)
  assert.match(stdout, /backend=say/)
  assert.match(stdout, /voice=Samantha/)
  assert.match(stdout, /Deploy verified\./)
})

test('a Premium voice is auto-picked over Samantha', async () => {
  const fixture = `${FIXTURE}\nAva (Premium)       en_US    # Hello!`
  const { stdout } = await run(['--dry', 'hi'], { fixture })
  assert.match(stdout, /voice=Ava \(Premium\)/)
})

test('a 19-char Enhanced name survives the collapsed column', async () => {
  const fixture = `${FIXTURE}\nSamantha (Enhanced) en_US    # Hello!`
  const { stdout } = await run(['--dry', 'hi'], { fixture })
  assert.match(stdout, /voice=Samantha \(Enhanced\)/)
})

test('speaking passes the resolved voice through to `say`', async () => {
  const { sayCalls } = await run(['hello there'])
  assert.match(sayCalls, /SAY -v Samantha -r 180 -- hello there/)
})

test('reads stdin when no positional argument is given', async () => {
  const { stdout } = await run(['--dry'], { stdin: 'from a pipe\n' })
  assert.match(stdout, /from a pipe/)
})

test('an empty argument errors instead of hanging on an open pipe', async () => {
  // The shell version tested emptiness rather than "was an arg passed", so
  // `speak ""` fell through to stdin and blocked forever.
  const { code, stderr } = await run([''])
  assert.equal(code, 1)
  assert.match(stderr, /nothing to say/)
})

test('--voice and --rate override auto-detection', async () => {
  const { sayCalls } = await run(['--voice', 'Kathy', '--rate', '210', 'hi'])
  assert.match(sayCalls, /SAY -v Kathy -r 210 -- hi/)
})

test('--dry never invokes `say` to speak', async () => {
  const { sayCalls } = await run(['--dry', 'silence please'])
  assert.equal(sayCalls, '', 'dry run must not produce sound')
})

test('-- ends flag parsing', async () => {
  const { stdout } = await run(['--dry', '--', '--not-a-flag'])
  assert.match(stdout, /--not-a-flag/)
})

test('an unknown flag is rejected with help', async () => {
  const { code, stderr } = await run(['--bogus', 'hi'])
  assert.equal(code, 1)
  assert.match(stderr, /unknown option/)
})

test('--list nudges toward the free voice download when none is installed', async () => {
  const { stdout } = await run(['--list'])
  assert.match(stdout, /No Premium or Enhanced English voices/)
  assert.match(stdout, /Manage Voices/)
})

test('--list shows installed good voices instead of the nudge', async () => {
  const fixture = `${FIXTURE}\nAva (Premium)       en_US    # Hello!`
  const { stdout } = await run(['--list'], { fixture })
  assert.match(stdout, /Ava \(Premium\)/)
  assert.doesNotMatch(stdout, /No Premium or Enhanced/)
})

test('long text is trimmed to a spoken TLDR', async () => {
  const long = 'This is a sentence. '.repeat(60)
  const { stdout } = await run(['--dry', long])
  const chars = Number(stdout.match(/chars=(\d+)/)[1])
  assert.ok(chars <= 400, `expected <=400, got ${chars}`)
})

test('config set switches the default backend, and show redacts the key', async () => {
  let r = await run(['config', 'set', 'backend', 'elevenlabs'])
  assert.equal(r.code, 0)
  r = await run(['config', 'set', 'elevenlabs.apiKey', 'sk-supersecret'])
  assert.match(r.stdout, /stored, 0600/)
  assert.doesNotMatch(r.stdout, /supersecret/)

  r = await run(['config', 'show'])
  assert.doesNotMatch(r.stdout, /supersecret/, 'the key must never be printed in full')
  assert.match(r.stdout, /"backend": "elevenlabs"/)

  // and it is actually in effect
  r = await run(['--dry', 'hi'])
  assert.match(r.stdout, /backend=elevenlabs/)

  await run(['config', 'set', 'backend', 'say']) // restore for other tests
})

test('config rejects an unknown backend and an unknown key', async () => {
  let r = await run(['config', 'set', 'backend', 'festival'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /unknown backend/)

  r = await run(['config', 'set', 'nope.nope', 'x'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /is not a config key/)
})

test('--check distinguishes executable availability from speaker access', async () => {
  const { stdout, code } = await run(['--check'])
  assert.equal(code, 0)
  assert.match(stdout, /say: executable available; speaker access unverified/)
  assert.doesNotMatch(stdout, /say: ready/)
})

test('init --agent codex prints the host-audio requirement', async () => {
  const { stdout, code } = await run(['init', '--agent', 'codex', '--print'])
  assert.equal(code, 0)
  assert.match(stdout, /sandbox_permissions.*require_escalated/)
})

test('--help and --version work', async () => {
  assert.match((await run(['--help'])).stdout, /spoken output for coding agents/)
  assert.match((await run(['--version'])).stdout, /^\d+\.\d+\.\d+/)
})

// --- mute -------------------------------------------------------------------
// Own config home so a mute here can't leak into the tests above.
const MUTE_HOME = mkdtempSync(join(tmpdir(), 'sayeth-mutecfg-'))
const muted = (args, opts = {}) =>
  run(args, { ...opts, env: { XDG_CONFIG_HOME: MUTE_HOME, ...(opts.env || {}) } })

test('mute silences speaking but still exits 0', async () => {
  let r = await muted(['mute', '30m'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /muted for 30 minutes/)

  // The whole contract: the caller sees success and simply hears nothing.
  r = await muted(['hello there'])
  assert.equal(r.code, 0, 'a mute is the user\'s choice, not a failure for the caller')
  assert.equal(r.sayCalls, '', '`say` must not be invoked while muted')
})

test('unmute restores speaking', async () => {
  let r = await muted(['unmute'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /unmuted/)

  r = await muted(['hello there'])
  assert.match(r.sayCalls, /SAY .* -- hello there/)
})

test('unmute when not muted says so instead of erroring', async () => {
  const r = await muted(['unmute'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /was not muted/)
})

test('mute with no duration is indefinite', async () => {
  await muted(['mute'])
  const r = await muted(['--check'])
  assert.match(r.stdout, /muted:\s+indefinitely/)
  await muted(['unmute'])
})

test('--check reports remaining mute time', async () => {
  await muted(['mute', '2h'])
  const r = await muted(['--check'])
  assert.match(r.stdout, /muted:\s+(1 hour 59 minutes|2 hours)/)
  await muted(['unmute'])
})

test('--check reports no mute when there is none', async () => {
  const r = await muted(['--check'])
  assert.match(r.stdout, /muted:\s+no/)
})

test('--dry still works while muted, since it makes no sound', async () => {
  await muted(['mute', '1h'])
  const r = await muted(['--dry', 'still inspectable'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /still inspectable/)
  assert.match(r.stdout, /muted=yes/)
  await muted(['unmute'])
})

test('config and voice listing still work while muted', async () => {
  await muted(['mute', '1h'])
  assert.equal((await muted(['config', 'path'])).code, 0)
  assert.equal((await muted(['--list'])).code, 0)
  await muted(['unmute'])
})

test('an unparseable duration is rejected rather than guessed at', async () => {
  const r = await muted(['mute', 'half an hour'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /couldn't understand the duration/)

  // and it must not have muted anything on the way out
  assert.match((await muted(['--check'])).stdout, /muted:\s+no/)
})

test('a mute longer than the 30 day ceiling is refused with a pointer', async () => {
  const r = await muted(['mute', '60d'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /30 day maximum/)
  assert.match(r.stderr, /mute` with no duration/)
})
