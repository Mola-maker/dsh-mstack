/** DeepSeek Harness plugin: bundle mstack workflow skills for AI agents. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Plugin configuration for dsh-mstack. */
export interface Config {
  /** Optional custom assets root containing skills; defaults to packaged skills folder. */
  skillsRoot?: string
}

/** Config schema. */
export const Config: z<Config> = z.object({
  skillsRoot: z.string().optional(),
})

/** Cordis Loader plugin identity. */
export const name = 'dsh-mstack'

/** Injected services required by this plugin. */
export const inject = ['skills']

function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) {
    throw new Error(`dsh-mstack: ${path} has no YAML frontmatter`)
  }
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? (metadata as { description: unknown }).description : undefined
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`dsh-mstack: ${path} has no description`)
  }
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Register all mstack skills into the DeepSeek Harness skill catalog.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const skillsRoot = config.skillsRoot ?? fileURLToPath(new URL('../skills/', import.meta.url))
  if (!isAbsolute(skillsRoot)) {
    throw new Error('dsh-mstack: skillsRoot must be an absolute path')
  }

  let skillNames: string[] = []
  try {
    skillNames = readdirSync(skillsRoot).filter((entry) => {
      if (entry.startsWith('.')) return false
      const dir = join(skillsRoot, entry)
      const skillFile = join(dir, 'SKILL.md')
      try {
        return statSync(dir).isDirectory() && statSync(skillFile).isFile()
      } catch {
        return false
      }
    })
  } catch (err) {
    ctx.logger('dsh-mstack').warn(`Failed to read skills directory at ${skillsRoot}:`, err)
    return
  }

  const candidates: SkillCandidate[] = skillNames.map((skillName) => {
    const directory = join(skillsRoot, skillName)
    const filePath = join(directory, 'SKILL.md')
    const { description } = parseSkill(readFileSync(filePath, 'utf8'), filePath)
    return {
      name: skillName,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'dsh-mstack',
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
      locator: filePath,
    }
  })

  const provider: SkillProvider = {
    name: 'dsh-mstack',
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      const content = parseSkill(raw, locator as string).content
      return { ...summary, content }
    },
  }

  ctx.skills.registerProvider(() => provider)
  ctx.logger('dsh-mstack').info(`Registered ${candidates.length} mstack skills from ${skillsRoot}`)
}
