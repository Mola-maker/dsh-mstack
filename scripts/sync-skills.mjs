#!/usr/bin/env node
// Replace skills/ with the skills of an mstack checkout, so the plugin ships what mstack ships.
// Usage: node scripts/sync-skills.mjs <path to an mstack checkout>   (run before a release)
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const from = process.argv[2]
if (!from) {
  console.error('usage: node scripts/sync-skills.mjs <mstack checkout>')
  process.exit(2)
}
const src = resolve(from, 'skills')
if (!existsSync(join(src, 'm-start', 'SKILL.md'))) {
  console.error(`not an mstack checkout: ${src}/m-start/SKILL.md is missing`)
  process.exit(2)
}
const dest = fileURLToPath(new URL('../skills/', import.meta.url))
const names = readdirSync(src).filter((n) => /^m-[a-z-]+$/.test(n) && statSync(join(src, n)).isDirectory() && existsSync(join(src, n, 'SKILL.md')))
rmSync(dest, { recursive: true, force: true })
for (const n of names) cpSync(join(src, n), join(dest, n), { recursive: true })
console.log(`synced ${names.length} skills from ${src}: ${names.join(' ')}`)
