/** Bootstrap: emit typert face artifacts + remote-client files without a tsdown run. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkspaceTypertGenerator } from '../packages/typert/generator/src/workspace.ts'

const root = process.cwd()
const faces = ['host'] as const

function readManifest(packageDir: string): { name?: string; exports?: unknown } {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name?: string
    exports?: unknown
  }
}

function hasTypertExport(exportsField: unknown): boolean {
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return false
  return (
    Object.hasOwn(exportsField, './typert') ||
    Object.hasOwn(exportsField, './client/typert') ||
    Object.hasOwn(exportsField, './remote')
  )
}

const generator = new WorkspaceTypertGenerator(root)
const packages = generator
  .discover(faces)
  .filter(candidate => hasTypertExport(readManifest(join(root, candidate.root)).exports))
  .map(candidate => candidate.package)
console.log(`bootstrap: ${String(packages.length)} typert contributors`)
const artifacts = generator.generate(packages, faces)
for (const artifact of artifacts) {
  const output = join(root, artifact.packageRoot, 'lib')
  mkdirSync(output, { recursive: true })
  let emittedRemote = false
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote !== undefined) {
    emittedRemote = true
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
  if (!emittedRemote && artifact.face === 'host') {
    for (const file of [
      'typert.remote-client.js',
      'typert.remote-client.d.ts',
      'typert.remote-client.d.ts.map',
    ]) {
      rmSync(join(output, file), { force: true })
    }
  }
  console.log(
    `bootstrap: emitted ${artifact.package} (${artifact.face}${artifact.remote !== undefined ? ', remote' : ''})`,
  )
}
console.log('bootstrap: done')
