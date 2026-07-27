#!/usr/bin/env node
// outloud — spoken output for coding agents.
//
//   outloud "Deploy verified. All routes healthy."
//   echo "..." | outloud
//   outloud --voice "Ava (Premium)" --rate 200 "faster, better voice"
//   outloud --backend elevenlabs "use the good voice just this once"
//   outloud --list                 # voices available on the current backend
//   outloud --dry "text"           # print what WOULD be spoken, say nothing
//   outloud config show

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { loadConfig, readConfigFile, writeConfigFile, configPath, SETTABLE, getPath, setPath, coerce } from './config.mjs'
import { getBackend, BACKEND_NAMES } from './backends/index.mjs'
import { trimToSpoken } from './text.mjs'

const HELP = `outloud — spoken output for coding agents

USAGE
  outloud [options] <text>
  <text> | outloud [options]
  outloud config <show|path|get|set|unset> [key] [value]

OPTIONS
  -b, --backend <name>   ${BACKEND_NAMES.join(' | ')}   (default: say)
  -v, --voice <name>     voice name (say) or voice id (elevenlabs)
  -r, --rate <wpm>       speech rate for the say backend (default: 180)
      --max-chars <n>    cap spoken length (default: 400, 0 disables)
      --list             list voices available on the current backend
      --dry              print what would be spoken, without speaking
      --check            report whether the current backend is usable
  -h, --help             this
      --version          version
  --                     everything after this is text, not flags

CONFIG
  ~/.config/outloud/config.json    (override with XDG_CONFIG_HOME)
  Env: OUTLOUD_BACKEND, OUTLOUD_VOICE, OUTLOUD_RATE, OUTLOUD_MAX_CHARS,
       ELEVENLABS_API_KEY
  Precedence: flags > env > config file > defaults

  outloud config set backend elevenlabs      # switch the default backend
  outloud config set say.voice "Ava (Premium)"
  outloud config set elevenlabs.apiKey sk-...

VOICE QUALITY (say backend)
  macOS ships base voices, which sound robotic. Enhanced and Premium voices are
  a FREE download and sound dramatically better:
    System Settings > Accessibility > Spoken Content > System Voice >
    Manage Voices
  outloud auto-picks the best installed English voice, so a later download is
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
    if (!raw || Number.isNaN(n)) fail(`outloud: ${name} expects a number, got "${raw ?? ''}"`)
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
        if (a.startsWith('-') && a !== '-') fail(`outloud: unknown option "${a}"\n\n${HELP}`)
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
      if (!key) fail('outloud: config get <key>')
      const val = getPath(loadConfig(), key)
      process.stdout.write((val === undefined ? '' : String(val)) + '\n')
      return
    }
    case 'set': {
      const value = rest.join(' ')
      if (!key || value === '') fail('outloud: config set <key> <value>')
      if (!SETTABLE.has(key)) {
        fail(`outloud: "${key}" is not a config key.\nKnown keys:\n  ${[...SETTABLE].join('\n  ')}`)
      }
      if (key === 'backend' && !BACKEND_NAMES.includes(value)) {
        fail(`outloud: unknown backend "${value}". Known: ${BACKEND_NAMES.join(', ')}`)
      }
      const file = readConfigFile(path)
      setPath(file, key, coerce(key, value))
      writeConfigFile(file, path)
      const shown = key === 'elevenlabs.apiKey' ? '(stored, 0600)' : value
      process.stdout.write(`${key} = ${shown}\n${path}\n`)
      return
    }
    case 'unset': {
      if (!key) fail('outloud: config unset <key>')
      const file = readConfigFile(path)
      setPath(file, key, undefined)
      writeConfigFile(file, path)
      process.stdout.write(`${key} unset (back to default)\n`)
      return
    }
    default:
      fail('outloud: config <show|path|get|set|unset>')
  }
}

async function main() {
  const argv = process.argv.slice(2)

  if (argv[0] === 'config') return runConfig(argv.slice(1))

  const { flags, positional, sawPositional } = parseArgs(argv)

  if (flags.help) return void process.stdout.write(HELP + '\n')
  if (flags.version) return void process.stdout.write(version() + '\n')

  const cfg = loadConfig({ flags })
  const backend = getBackend(cfg.backend)

  if (flags.check) {
    const { ok, reason } = await backend.check(cfg)
    process.stdout.write(`${cfg.backend}: ${ok ? 'ready' : 'NOT ready'}\n`)
    if (!ok) process.stdout.write(reason + '\n')
    process.exit(ok ? 0 : 1)
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
            'outloud will pick one up automatically once installed.\n',
        )
      }
    } else {
      for (const v of voices) process.stdout.write(`  ${v.name}  ${v.id}  [${v.tier}]\n`)
    }
    return
  }

  // Args and stdin are mutually exclusive, decided by whether a positional was
  // PASSED — not by whether the result is empty. Testing emptiness meant
  // `outloud ""` fell through to stdin and blocked forever on an open pipe.
  let raw = ''
  if (sawPositional) raw = positional.join(' ')
  else if (!process.stdin.isTTY) raw = await readStdin()

  const text = trimToSpoken(raw, cfg.maxChars)
  if (!text) fail('outloud: nothing to say.')

  if (flags.dry) {
    const d = await backend.describe(cfg)
    const meta = Object.entries(d).map(([k, v]) => `${k}=${v}`).join(' ')
    process.stdout.write(`backend=${cfg.backend} ${meta} chars=${text.length}\n${text}\n`)
    return
  }

  await backend.speak(text, cfg)
}

main().catch((err) => fail(err?.message ?? String(err)))
