import { defineConfig } from 'tsdown'

/**
 * Cordis publishes one ESM runtime bundle. The entry is the JS emitted by
 * tsc under lib/types; the bundle gives the package's exports map its
 * default target (lib/index.js) so Vite's commonjs resolver and plain Node
 * consumers resolve the vendored framework.
 */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
