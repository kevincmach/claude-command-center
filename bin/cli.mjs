#!/usr/bin/env node
// In a published build, dist/server/index.js exists. In a clone, fall back to tsx.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const built = join(root, 'dist/server/index.js')
const cmd = existsSync(built)
  ? ['node', built]
  : ['npx', 'tsx', join(root, 'src/server/index.ts')]
spawn(cmd[0], [...cmd.slice(1), ...process.argv.slice(2)], { stdio: 'inherit' })
