#!/usr/bin/env node
// sayeth — spoken output for coding agents.
//
//   sayeth "Deploy verified. All routes healthy."
//   echo "..." | sayeth
//   sayeth --voice "Ava (Premium)" --rate 200 "faster, better voice"
//   sayeth --backend elevenlabs "use the good voice just this once"
//   sayeth --list                 # voices available on the current backend
//   sayeth --dry "text"           # print what WOULD be spoken, say nothing
//   sayeth config show

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { loadConfig, readConfigFile, writeConfigFile, configPath, SETTABLE, getPath, setPath, coerce } from './config.mjs'
import { getBackend, BACKEND_NAMES } from './backends/index.mjs'
import { trimToSpoken } from './text.mjs'
import {
  readMute, setMute, clearMute, parseDuration, formatDuration, describeMute, MAX_MUTE_MS,
} from './mute.mjs'
import { runInit, block, instructions, TARGETS, TARGET_NAMES } from './init.mjs'

const HELP = `sayeth — spoken output for coding agents

USAGE
  sayeth [options] <text>
  <text> | sayeth [options]
  sayeth init [--agent <name>] [--file <path>] [--print]
  sayeth mute [duration]
  sayeth unmute
  sayeth config <show|path|get|set|unset> [key] [value]

SETUP
  sayeth init            Write the agent instructions into the right file for
                         you, so there is nothing to copy out of a README.
                         Detects the agent from the files already in the
                         project, and is safe to re-run: the block is fenced in
                         markers, so a second run updates in place instead of
                         appending a duplicate.

    --agent <name>       ${TARGET_NAMES.join(', ')}
    --file <path>        write somewhere specific, e.g. ~/.claude/CLAUDE.md
    --print              print the block to stdout, write nothing

OPTIONS
  -b, --backend <name>   ${BACKEND_NAMES.join(' | ')}   (default: say)
  -v, --voice <name>     voice name (say) or voice id (elevenlabs)
  -r, --rate <wpm>       speech rate for the say backend (default: 180)
      --max-chars <n>    cap spoken length (default: 400, 0 disables)
      --list             list voices available on the current backend
      --dry              print what would be spoken, without speaking
      --check            report backend readiness and mute state
  -h, --help             this
      --version          version
  --                     everything after this is text, not flags

MUTE
  Silence it for a while without uninstalling anything or editing config.
  While muted, speaking is a no-op that still exits 0, so agents and hooks
  calling sayeth carry on normally — they just don't make noise.

  sayeth mute 30m        # also: 2h, 90s, 1h30m, or a bare number for minutes
  sayeth mute            # indefinitely, until you unmute
  sayeth unmute
  sayeth --check         # is it muted, and for how much longer?

  A timed mute expires on its own, so a forgotten \`mute 30m\` never silences
  you permanently.

CONFIG
  ~/.config/sayeth/config.json    (override with XDG_CONFIG_HOME)
  Env: SAYETH_BACKEND, SAYETH_VOICE, SAYETH_RATE, SAYETH_MAX_CHARS,
       ELEVENLABS_API_KEY
  Precedence: flags > env > config file > defaults

  sayeth config set backend elevenlabs      # switch the default backend
  sayeth config set say.voice "Ava (Premium)"
  sayeth config set elevenlabs.apiKey sk-...

VOICE QUALITY (say backend)
  macOS ships base voices, which sound robotic. Enhanced and Premium voices are
  a FREE download and sound dramatically better:
    System Settings > Accessibility > Spoken Content > System Voice >
    Manage Voices
  sayeth auto-picks the best installed English voice, so a later download is
  used with no config change.`

function fail(msg, code = 1) {
  process.stderr.write(msg.replace(/\n?$/, '\n'))
  process.exit(code)
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  let sawPositional = false

  const num = (raw, name) => {
    const n = Number(raw)
    if (!raw || Number.isNaN(n)) fail(`sayeth: ${name} expects a number, got "${raw ?? ''}"`)
    return n
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-b': case '--backend':   flags.backend = argv[++i]; break
      case '-v': case '--voice':     flags.voice = argv[++i]; break
      case '-r': case '--rate':      flags.rate = num(argv[++i], '--rate'); break
      case '--max-chars':            flags.maxChars = num(argv[++i], '--max-chars'); break
      case '--dry':                  flags.dry = true; break
      case '--list':                 flags.list = true; break
      case '--check':                flags.check = true; break
      case '-h': case '--help':      flags.help = true; break
      case '--version':              flags.version = true; break
      case '--':
        positional.push(...argv.slice(i + 1))
        if (argv.length > i + 1) sawPositional = true
        i = argv.length
        break
      default:
        if (a.startsWith('-') && a !== '-') fail(`sayeth: unknown option "${a}"\n\n${HELP}`)
        positional.push(a)
        sawPositional = true
    }
  }
  return { flags, positional, sawPositional }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(''))
  })
}

function version() {
  const here = dirname(fileURLToPath(import.meta.url))
  return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version
}

async function runConfig(args) {
  const [sub, key, ...rest] = args
  const path = configPath()

  switch (sub) {
    case 'path':
      process.stdout.write(path + '\n')
      return
    case 'show': {
      const cfg = loadConfig()
      // Never print a secret in full.
      if (cfg.elevenlabs?.apiKey) {
        cfg.elevenlabs = { ...cfg.elevenlabs, apiKey: `${cfg.elevenlabs.apiKey.slice(0, 6)}…(set)` }
      }
      process.stdout.write(JSON.stringify(cfg, null, 2) + '\n')
      return
    }
    case 'get': {
      if (!key) fail('sayeth: config get <key>')
      const val = getPath(loadConfig(), key)
      process.stdout.write((val === undefined ? '' : String(val)) + '\n')
      return
    }
    case 'set': {
      const value = rest.join(' ')
      if (!key || value === '') fail('sayeth: config set <key> <value>')
      if (!SETTABLE.has(key)) {
        fail(`sayeth: "${key}" is not a config key.\nKnown keys:\n  ${[...SETTABLE].join('\n  ')}`)
      }
      if (key === 'backend' && !BACKEND_NAMES.includes(value)) {
        fail(`sayeth: unknown backend "${value}". Known: ${BACKEND_NAMES.join(', ')}`)
      }
      const file = readConfigFile(path)
      setPath(file, key, coerce(key, value))
      writeConfigFile(file, path)
      const shown = key === 'elevenlabs.apiKey' ? '(stored, 0600)' : value
      process.stdout.write(`${key} = ${shown}\n${path}\n`)
      return
    }
    case 'unset': {
      if (!key) fail('sayeth: config unset <key>')
      const file = readConfigFile(path)
      setPath(file, key, undefined)
      writeConfigFile(file, path)
      process.stdout.write(`${key} unset (back to default)\n`)
      return
    }
    default:
      fail('sayeth: config <show|path|get|set|unset>')
  }
}

function runMute(args) {
  const arg = args.join(' ').trim()

  if (!arg) {
    setMute(null)
    process.stdout.write('sayeth: muted indefinitely. Run `sayeth unmute` to turn it back on.\n')
    return
  }

  const ms = parseDuration(arg)
  if (ms === null) {
    fail(
      `sayeth: couldn't understand the duration "${arg}".\n` +
        'Try: 30m, 2h, 90s, 1h30m, or a bare number for minutes.',
    )
  }
  if (ms <= 0) fail('sayeth: mute duration must be greater than zero.')
  if (ms > MAX_MUTE_MS) {
    fail(
      `sayeth: ${formatDuration(ms)} is longer than the 30 day maximum.\n` +
        'Use `sayeth mute` with no duration to mute indefinitely.',
    )
  }

  const { until } = setMute(ms)
  process.stdout.write(
    `sayeth: muted for ${formatDuration(ms)}, until ${until.toLocaleString()}.\n` +
      'Run `sayeth unmute` to end it early.\n',
  )
}

function runUnmute() {
  const state = readMute()
  clearMute()
  process.stdout.write(state.muted ? 'sayeth: unmuted.\n' : 'sayeth: was not muted.\n')
}

function runInitCommand(args) {
  let target = null
  let file = null
  let print = false

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agent': case '-a': target = args[++i]; break
      case '--file': case '-f': file = args[++i]; break
      case '--print': print = true; break
      default: fail(`sayeth: unknown option "${args[i]}" for init.\nUsage: sayeth init [--agent <name>] [--file <path>] [--print]`)
    }
  }

  if (target && !TARGETS[target]) {
    fail(`sayeth: unknown agent "${target}". Known: ${TARGET_NAMES.join(', ')}`)
  }
  if (file && file.startsWith('~')) {
    fail('sayeth: --file needs a real path, not ~ (your shell usually expands it; quote it and it will not).')
  }

  // Written instructions follow the user's config: maxChars sets the length the
  // agent is asked to write to, `style` adds their own guidance, and an explicit
  // target can add runtime-specific requirements.
  const cfg = loadConfig()
  const text = instructions({ maxChars: cfg.maxChars, style: cfg.style, target })

  if (print) return void process.stdout.write(block(text) + '\n')

  const { path, action, label } = runInit({ target, file, text })

  const said = {
    created: `created ${path}`,
    appended: `added the ${label} instructions to ${path}`,
    updated: `updated the instructions in ${path}`,
    unchanged: `${path} is already up to date`,
    'already-present': `${path} already has spoken-output instructions — left it alone`,
  }[action]

  process.stdout.write(`sayeth: ${said}\n`)

  if (action === 'created' || action === 'appended' || action === 'updated') {
    process.stdout.write(
      '\nYour agent will speak after substantive tasks from its next session.\n' +
        'Re-run `sayeth init` any time to pull in updated instructions.\n',
    )
  }
  if (action === 'already-present') {
    process.stdout.write(
      'It looks hand-pasted. Delete that section and re-run init to get the\n' +
        'marker-fenced version, which future updates can revise in place.\n',
    )
  }
}

async function main() {
  const argv = process.argv.slice(2)

  if (argv[0] === 'config') return runConfig(argv.slice(1))
  if (argv[0] === 'init') return runInitCommand(argv.slice(1))
  if (argv[0] === 'mute') return runMute(argv.slice(1))
  if (argv[0] === 'unmute') return runUnmute()

  const { flags, positional, sawPositional } = parseArgs(argv)

  if (flags.help) return void process.stdout.write(HELP + '\n')
  if (flags.version) return void process.stdout.write(version() + '\n')

  const cfg = loadConfig({ flags })
  const backend = getBackend(cfg.backend)

  if (flags.check) {
    const { ok, reason, status } = await backend.check(cfg)
    const mute = readMute()

    process.stdout.write(`${cfg.backend}: ${ok ? (status ?? 'ready') : 'NOT ready'}\n`)
    const described = await backend.describe(cfg).catch(() => ({}))
    for (const [k, v] of Object.entries(described)) {
      process.stdout.write(`${(k + ':').padEnd(9)}${v}\n`)
    }
    process.stdout.write(`${'muted:'.padEnd(9)}${describeMute(mute)}\n`)

    if (!ok) {
      process.stdout.write('\n' + reason + '\n')
      process.exit(1)
    }

    // A check that cannot detect "exited 0 but made no sound" is not a check,
    // and that is the exact failure people hit: a sandboxed agent, a muted
    // output device, an audio pipeline that silently drops frames. So speak.
    if (mute.muted) {
      process.stdout.write('\nSkipped the audio test — you are muted.\n')
    } else if (backend.metered) {
      // Speaking here would bill a real account nobody asked us to spend.
      process.stdout.write(
        `\nNot tested audibly: ${cfg.backend} bills per character.\n` +
          `To hear it, ask for it: sayeth --backend ${cfg.backend} "test"\n`,
      )
    } else {
      process.stdout.write('\nSpeaking a test phrase…\n')
      try {
        await backend.speak('Sayeth is working.', cfg)
        process.stdout.write(
          'Spoke without error. If you heard nothing, the audio never reached\n' +
            'your speakers — check the volume, the output device, and whether\n' +
            'the calling agent is sandboxed.\n',
        )
      } catch (err) {
        process.stdout.write('FAILED while speaking.\n')
        fail(err?.message ?? String(err))
      }
    }
    process.exit(0)
  }

  if (flags.list) {
    const voices = await backend.listVoices(cfg)
    const best = await backend.describe(cfg)
    process.stdout.write(`Backend: ${backend.label}\nUsing:   ${best.voice}\n\n`)

    if (cfg.backend === 'say') {
      const good = voices.filter((v) => v.tier !== 'Base' && v.locale.startsWith('en'))
      if (good.length) {
        process.stdout.write('Premium / Enhanced English voices installed:\n')
        for (const v of good) process.stdout.write(`  ${v.name}  [${v.locale}]\n`)
      } else {
        process.stdout.write(
          'No Premium or Enhanced English voices installed.\n' +
            'They are a FREE download and sound dramatically better:\n' +
            '  System Settings > Accessibility > Spoken Content >\n' +
            '  System Voice > Manage Voices\n' +
            'sayeth will pick one up automatically once installed.\n',
        )
      }
    } else {
      for (const v of voices) process.stdout.write(`  ${v.name}  ${v.id}  [${v.tier}]\n`)
    }
    return
  }

  // Args and stdin are mutually exclusive, decided by whether a positional was
  // PASSED — not by whether the result is empty. Testing emptiness meant
  // `sayeth ""` fell through to stdin and blocked forever on an open pipe.
  let raw = ''
  if (sawPositional) raw = positional.join(' ')
  else if (!process.stdin.isTTY) raw = await readStdin()

  const text = trimToSpoken(raw, cfg.maxChars)
  if (!text) fail('sayeth: nothing to say.')

  if (flags.dry) {
    const d = await backend.describe(cfg)
    const meta = Object.entries(d).map(([k, v]) => `${k}=${v}`).join(' ')
    const mute = readMute()
    const muted = mute.muted ? ' muted=yes' : ''
    process.stdout.write(
      `backend=${cfg.backend} ${meta} chars=${text.length}${muted}\n${text}\n`,
    )
    return
  }

  // Muted: do nothing, but exit 0. Agents and hooks calling sayeth must carry on
  // normally — a mute is the user's choice, not a failure for the caller to
  // report or retry. The note goes to stderr, and only when someone is actually
  // watching, so it never pollutes a pipeline or a hook's captured output.
  const mute = readMute()
  if (mute.muted) {
    if (process.stderr.isTTY) {
      process.stderr.write(
        mute.forever
          ? 'sayeth: muted — run `sayeth unmute` to turn it back on.\n'
          : `sayeth: muted for another ${formatDuration(mute.remainingMs)} — run \`sayeth unmute\` to end it early.\n`,
      )
    }
    return
  }

  await backend.speak(text, cfg)
}

main().catch((err) => fail(err?.message ?? String(err)))
