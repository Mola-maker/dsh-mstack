/**
 * mstack's state in the dsh-TUI footer: one field, read straight from the files mstack writes, so it needs no
 * server. The verify verdict of the checkout DSH runs in, and how many `mola go` runs wait for you or work.
 *
 *  - `<git root>/.mstack/verify/status.json`   the Stop hook's last verdict
 *  - `<cwd>/.mstack/runs/<id>/progress.json`    each run's state
 *
 * Pure functions here; `watchStatus` is the timer the plugin mounts when the TUI's `tuiStatus` service exists.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type Tone = 'dim' | 'accent' | 'success' | 'warning' | 'error'

export interface FieldValue {
  /** at most 32 terminal cells (a CJK character takes two) */
  text: string
  tone: Tone
  /** the hover line, at most 160 cells */
  detail: string
}

function gitRoot(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function readObject(file: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

interface Verify { ok: boolean | null; required?: string; found?: string }

function verifyOf(cwd: string): Verify | null {
  const root = gitRoot(cwd)
  const st = root ? readObject(join(root, '.mstack', 'verify', 'status.json')) : null
  if (!st) return null
  const msg = typeof st.message === 'string' ? st.message.slice(0, 400) : ''
  const m = /required (L[0-5]), found (L[0-5]|no receipt|no passing check|no valid receipt)\b/.exec(msg)
  return { ok: st.ok === true ? true : st.ok === false ? false : null, ...(m ? { required: m[1], found: m[2] } : {}) }
}

/** Runs that wait for you (blocked) and runs that work, from the 50 newest run folders. */
function runsOf(cwd: string): { blocked: number; running: number; reason?: string } {
  const dir = join(cwd, '.mstack', 'runs')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { blocked: 0, running: 0 }
  }
  const recent = names
    .map((n) => {
      try {
        return { n, t: statSync(join(dir, n, 'progress.json')).mtimeMs }
      } catch {
        return null
      }
    })
    .filter((x): x is { n: string; t: number } => x !== null)
    .sort((a, b) => b.t - a.t)
    .slice(0, 50)
  let blocked = 0
  let running = 0
  let reason: string | undefined
  for (const { n } of recent) {
    const p = readObject(join(dir, n, 'progress.json'))
    if (p?.status === 'blocked') {
      blocked++
      const b = p.blocked as { reason?: unknown } | undefined
      if (reason === undefined && typeof b?.reason === 'string') reason = b.reason
    } else if (p?.status === 'running') running++
  }
  return { blocked, running, ...(reason !== undefined ? { reason } : {}) }
}

// control characters, line separators and bidi overrides
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g
const clean = (s: string, n: number): string => s.replace(CONTROL, ' ').slice(0, n)

/** What the footer shows for `cwd`; undefined when mstack has left nothing there (the field is then cleared). */
export function footerField(cwd: string): FieldValue | undefined {
  const v = verifyOf(cwd)
  const r = runsOf(cwd)
  if (!v && r.blocked === 0 && r.running === 0) return undefined
  const parts: string[] = []
  const details: string[] = []
  if (v) {
    if (v.ok === true) {
      parts.push(`✓${v.required ?? ''}`)
      details.push(`验收达标${v.required ? `（${v.required}）` : ''}`)
    } else if (v.ok === false) {
      parts.push(v.found && v.required ? `✗${v.found}/${v.required}` : '✗')
      details.push(v.found && v.required ? `验收未达标：要求 ${v.required}，只有 ${v.found}` : '验收未达标')
    } else {
      parts.push('?')
      details.push('验收检查没能运行')
    }
  }
  if (r.blocked) {
    parts.push(`等你${r.blocked}`)
    details.push(`${r.blocked} 个任务等你处理${r.reason ? `：${r.reason}` : ''}（mola go approve / deny）`)
  }
  if (r.running) {
    parts.push(`跑${r.running}`)
    details.push(`${r.running} 个任务在跑`)
  }
  const tone: Tone = r.blocked || v?.ok === false ? 'error' : v?.ok === true ? 'success' : r.running ? 'accent' : 'dim'
  return { text: clean(`mstack ${parts.join(' ')}`, 32), tone, detail: clean(details.join('；'), 160) }
}

/** The part of the TUI's status service this plugin uses. */
export interface StatusService {
  setField(key: string, text: string | undefined, options?: { slot?: 'left-tail' | 'right-head' | 'right-tail'; tone?: Tone; maxCells?: number; minColumns?: number; detail?: string }): () => void
}

/**
 * Show the field and refresh it every `everyMs`; only a change is written. Returns the stop function.
 * Reading is a few small files, so a timer is cheaper than file watchers across folders that come and go.
 */
export function watchStatus(status: StatusService, cwd: string, everyMs = 3000, timers: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = globalThis): () => void {
  let last = ''
  let clear: (() => void) | undefined
  const tick = (): void => {
    let f: FieldValue | undefined
    try {
      f = footerField(cwd)
    } catch {
      f = undefined
    }
    const key = f ? `${f.text}|${f.tone}|${f.detail}` : ''
    if (key === last) return
    last = key
    if (!f) {
      clear?.()
      clear = undefined
      return
    }
    clear = status.setField('mstack', f.text, { slot: 'right-head', tone: f.tone, maxCells: 32, minColumns: 70, detail: f.detail })
  }
  tick()
  const timer = timers.setInterval(tick, everyMs)
  ;(timer as { unref?: () => void }).unref?.()
  return () => {
    timers.clearInterval(timer)
    clear?.()
  }
}
