import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildShell, commandName, check, listVoices, describe, speak, metered } from '../src/backends/command.mjs'
import { BACKENDS } from '../src/backends/index.mjs'

const cfg = (command) => ({ maxChars: 400, pauseMs: 450, command })

test('substitutes {{voice}} from config', () => {
  assert.equal(
    buildShell(cfg({ shell: 'piper -m {{voice}} | aplay', voice: '/models/en.onnx' })),
    'piper -m /models/en.onnx | aplay',
  )
})

test('substitutes every occurrence of {{voice}}', () => {
  assert.equal(buildShell(cfg({ shell: 'x {{voice}} y {{voice}}', voice: 'V' })), 'x V y V')
})

test('an unset voice becomes empty rather than the literal placeholder', () => {
  assert.equal(buildShell(cfg({ shell: 'espeak-ng {{voice}}' })), 'espeak-ng ')
})

test('an unconfigured backend explains what to do', () => {
  assert.throws(() => buildShell(cfg({})), /no command configured/)
  assert.throws(() => buildShell(cfg({})), /config set command\.shell/)
})

test('commandName finds the binary, including past a VAR= prefix', () => {
  assert.equal(commandName('piper -m x | aplay'), 'piper')
  assert.equal(commandName('  espeak-ng --stdout '), 'espeak-ng')
  assert.equal(commandName('FOO=bar piper -m x'), 'piper')
  assert.equal(commandName(''), '')
})

test('check reports each failure distinctly', async () => {
  const unconfigured = await check(cfg({}))
  assert.equal(unconfigured.ok, false)
  assert.match(unconfigured.reason, /no command configured/)

  const missing = await check(cfg({ shell: 'definitely-not-a-real-binary-xyz' }))
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /not on PATH/)

  assert.equal((await check(cfg({ shell: 'sh -c true' }))).ok, true)
})

test('listVoices returns nothing rather than guessing at another engine', async () => {
  assert.deepEqual(await listVoices(), [])
})

test('describe does not key on "command", which would collide with the backend name', async () => {
  const d = await describe(cfg({ shell: 'piper -m x', voice: 'V' }))
  assert.equal(d.runs, 'piper')
  assert.equal(d.voice, 'V')
  assert.ok(!('command' in d), 'two lines both reading "command:" read as contradictory')
})

test('text is piped to stdin, not embedded in the command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sayeth-cmd-'))
  const out = join(dir, 'captured.txt')
  await speak('Deploy verified.', cfg({ shell: `cat > ${JSON.stringify(out)}` }))
  assert.equal(readFileSync(out, 'utf8'), 'Deploy verified.')
})

test('pause markers survive as sentence breaks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sayeth-cmd-'))
  const out = join(dir, 'captured.txt')
  await speak('Two things. // One, this. // Two, that.', cfg({ shell: `cat > ${JSON.stringify(out)}` }))
  const got = readFileSync(out, 'utf8')
  assert.ok(!got.includes('//'), 'markers should be rendered, not passed through')
  assert.ok(!got.includes('slnc'), 'engine-specific markup must not leak to a foreign engine')
  assert.equal(got, 'Two things. One, this. Two, that.')
})

test('SECURITY: model-authored text cannot execute a shell command', async () => {
  // The whole reason there is no {{text}} placeholder. `sayeth` is called with
  // strings written by a language model; if those reached `sh -c`, a summary
  // mentioning $(...) or backticks would run it.
  const dir = mkdtempSync(join(tmpdir(), 'sayeth-inj-'))
  const canary = join(dir, 'pwned')
  const out = join(dir, 'captured.txt')

  const hostile = `Fixed $(touch ${canary}) and \`touch ${canary}\` and ; touch ${canary}`
  await speak(hostile, cfg({ shell: `cat > ${JSON.stringify(out)}` }))

  assert.equal(existsSync(canary), false, 'text was executed as shell — critical')
  assert.ok(readFileSync(out, 'utf8').includes('$(touch'), 'and is spoken verbatim instead')
})

test('a failing command surfaces its exit code and the pipeline', async () => {
  await assert.rejects(
    () => speak('hi', cfg({ shell: 'exit 3' })),
    (err) => /exited 3/.test(err.message) && /Command: exit 3/.test(err.message),
  )
})

test('backends declare whether speaking costs money', () => {
  // --check speaks to prove audio works, which must never bill someone.
  assert.equal(metered, false)
  assert.equal(BACKENDS.say.metered, false)
  assert.equal(BACKENDS.elevenlabs.metered, true)
})
