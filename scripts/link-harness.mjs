#!/usr/bin/env node
/**
 * Link the harness runtime packages this plugin develops against into a local
 * node_modules directory, so vitest and tsc resolve them without a publish.
 *
 * The plugin is developed inside a deepseek-harness checkout: this script
 * expects the harness tree as the parent directory and its host-face libraries
 * already built (`pnpm run build:lib` in the harness). It fails loud when
 * either assumption breaks. Links are idempotent: rerunning replaces them.
 */
import { mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const harnessRoot = join(root, '..')

/** npm package name → directory inside the harness tree. */
const LINKS = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/dsh-agent': 'packages/core/agent',
  '@deepseek-ai/dsh-agent-loop': 'packages/core/agent-loop',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-session': 'packages/core/session',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
}

function fail(message) {
  console.error(`link-harness: ${message}`)
  process.exit(1)
}

if (!readdirSync(harnessRoot).includes('pnpm-workspace.yaml')) {
  fail(`expected a deepseek-harness checkout at ${harnessRoot}`)
}

for (const [name, relative] of Object.entries(LINKS)) {
  const target = join(harnessRoot, relative)
  try {
    readdirSync(target)
  } catch {
    fail(`missing ${target}; is this the right harness checkout?`)
  }
  if (!readdirSync(target).includes('lib')) {
    fail(`${target} has no lib/; run \`pnpm run build:lib\` in the harness first`)
  }
  const link = join(root, 'node_modules', name)
  rmSync(link, { force: true, recursive: true })
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  console.log(`linked ${name} -> ${target}`)
}
