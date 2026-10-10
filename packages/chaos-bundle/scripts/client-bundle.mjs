/**
 * Self-contained browser-half bundler for the Chaos client plugins.
 *
 * The host serves `exports["./client"]` and executes it through
 * `window.__ModuleLoader__.load({ id, factory })`. The factory's `require`
 * answers only the shell's frozen module table, so every other import is
 * inlined. CSS Modules compile here because a profile bundle never passes
 * through the web shell's stylesheet pipeline.
 *
 * Run from a package directory: `node ../chaos-bundle/scripts/client-bundle.mjs`.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { build } from 'tsdown'
import { transform } from 'lightningcss'

const packageDir = process.cwd()
const manifest = JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8'))
const id = manifest.name
if (typeof id !== 'string' || id === '') throw new Error('client-bundle: package.json has no name')

/** Specifiers the shell seeds into the frozen module table. */
const PLATFORM = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

const CSS_MODULE_PREFIX = '\0chaos-css-module:'
const CSS_INLINE_PREFIX = '\0chaos-css-inline:'
const CSS_SUFFIX = '.mjs'

/**
 * Resolve a stylesheet import against the package sources. The browser entry
 * is the emitted `lib/types` file, whose sibling path has no stylesheet.
 * @param source - the import specifier as written.
 * @param importer - the absolute path of the importing module.
 * @returns the stylesheet's absolute path.
 */
function stylesheetPath(source, importer) {
  const emitted = resolve(dirname(importer), source)
  const marker = '/lib/'
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolve(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

await build({
  cwd: packageDir,
  name: `${id}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: specifier => PLATFORM.has(specifier),
    alwaysBundle: specifier => !PLATFORM.has(specifier),
  },
  inputOptions: {
    resolve: { conditionNames: ['production', 'browser', 'import', 'module', 'default'] },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [
    {
      name: 'chaos-client-externals',
      resolveId(source) {
        if (!source.startsWith('@deepseek-ai/') || PLATFORM.has(source)) return null
        throw new Error(
          `chaos client bundle: "${source}" is not in the shell module table, so inlining it would fork a shared runtime; collaborate through cordis services instead`,
        )
      },
    },
    {
      name: 'chaos-css-modules',
      resolveId(source, importer) {
        if (!source.endsWith('.module.css') || importer === undefined) return null
        return CSS_MODULE_PREFIX + stylesheetPath(source, importer) + CSS_SUFFIX
      },
      async load(virtualId) {
        if (!virtualId.startsWith(CSS_MODULE_PREFIX)) return null
        const file = virtualId.slice(CSS_MODULE_PREFIX.length, -CSS_SUFFIX.length)
        this.addWatchFile(file)
        const { code, exports } = transform({
          filename: file,
          code: await readFile(file),
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap = {}
        for (const [local, exported] of Object.entries(exports ?? {}).sort(([left], [right]) => left < right ? -1 : 1)) {
          classMap[local] = exported.name
        }
        return styleModule(id, file, code.toString(), classMap)
      },
    },
    {
      name: 'chaos-css-inline',
      resolveId(source, importer) {
        if (!source.endsWith('.css?inline') || importer === undefined) return null
        return CSS_INLINE_PREFIX + stylesheetPath(source.slice(0, -'?inline'.length), importer) + CSS_SUFFIX
      },
      async load(virtualId) {
        if (!virtualId.startsWith(CSS_INLINE_PREFIX)) return null
        const file = virtualId.slice(CSS_INLINE_PREFIX.length, -CSS_SUFFIX.length)
        this.addWatchFile(file)
        const { code } = transform({ filename: file, code: await readFile(file), minify: true })
        return `export default ${JSON.stringify(code.toString())};`
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
    sourcemapExcludeSources: false,
    banner: chunk => `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})

/** Emit one plugin-owned style injector plus the hashed class map. */
function styleModule(pluginId, file, css, classMap) {
  const tagId = `${pluginId}/${basename(file)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}
