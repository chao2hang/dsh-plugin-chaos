/**
 * Build every package from source. A git install runs this script and ships
 * no prebuilt lib/, so it must not assume the DeepSeek Harness checkout.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packages = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
// chaos-restart imports the built declarations of process-control.
packages.sort((left, right) => Number(left === 'process-control') - Number(right === 'process-control') || left < right ? -1 : 1)

for (const name of packages) {
  const dir = resolve(root, 'packages', name)
  const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'))
  const bundle = manifest.scripts?.bundle
  if (typeof bundle !== 'string') throw new Error(`prepare: ${name} has no bundle script`)
  console.log(`prepare: ${name}`)
  const result = spawnSync('pnpm', ['run', 'bundle'], { cwd: dir, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
