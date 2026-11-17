// The dsh-TUI footer field: what it shows for the files mstack leaves, and that it writes only on change.
// Run after `npm run build`: node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { footerField, watchStatus } from '../dist/tui.js'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mstack-tui-'))
  mkdirSync(join(dir, '.git'))
  return dir
}
const put = (file, obj) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(obj))
}
const run = (cwd, id, p) => put(join(cwd, '.mstack', 'runs', id, 'progress.json'), p)

test('nothing from mstack: no field', () => {
  assert.equal(footerField(repo()), undefined)
})

test('a failing verdict and a run that waits: red, both counted, the reason on hover', () => {
  const cwd = repo()
  put(join(cwd, '.mstack', 'verify', 'status.json'), { ok: false, message: 'verify gate: required L3, found L1 (receipt …)', ts: new Date().toISOString() })
  run(cwd, 'go-1', { status: 'blocked', blocked: { reason: 'approval needed: git push\u001b[31m' } })
  run(cwd, 'go-2', { status: 'running' })
  run(cwd, 'go-3', { status: 'done' })
  const f = footerField(cwd)
  assert.equal(f.text, 'mstack ✗L1/L3 等你1 跑1')
  assert.equal(f.tone, 'error')
  assert.match(f.detail, /要求 L3，只有 L1/)
  assert.match(f.detail, /approval needed: git push/)
  assert.doesNotMatch(f.detail, /\u001b/)
})

test('a passing verdict from a subfolder of the checkout: green', () => {
  const cwd = repo()
  put(join(cwd, '.mstack', 'verify', 'status.json'), { ok: true, message: 'verify gate: required L3, found L3' })
  const sub = join(cwd, 'pkg')
  mkdirSync(sub)
  const f = footerField(sub)
  assert.equal(f.text, 'mstack ✓L3')
  assert.equal(f.tone, 'success')
})

test('watchStatus writes on change only, clears when mstack leaves nothing, and stops', () => {
  const cwd = repo()
  const calls = []
  let cleared = 0
  const status = { setField: (key, text, opts) => { calls.push([key, text, opts]); return () => { cleared++ } } }
  let tick
  const timers = { setInterval: (fn) => { tick = fn; return 1 }, clearInterval: () => {} }
  const stop = watchStatus(status, cwd, 3000, timers)
  assert.equal(calls.length, 0, 'nothing to show yet')
  run(cwd, 'go-1', { status: 'running' })
  tick()
  tick()
  assert.equal(calls.length, 1)
  assert.deepEqual([calls[0][0], calls[0][1], calls[0][2].tone, calls[0][2].slot], ['mstack', 'mstack 跑1', 'accent', 'right-head'])
  run(cwd, 'go-1', { status: 'done' })
  tick()
  assert.equal(cleared, 1, 'cleared when nothing runs')
  run(cwd, 'go-1', { status: 'blocked' })
  tick()
  assert.equal(calls.length, 2)
  stop()
  assert.equal(cleared, 2)
})
