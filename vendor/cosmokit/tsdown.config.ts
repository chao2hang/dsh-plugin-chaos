import { defineConfig } from 'tsdown'

/**
 * Cosmokit publishes one ESM runtime bundle. The entry is the JS emitted by
 * tsc under lib/types; the bundle gives the package's exports map its
 * default target (lib/index.js) so the vendored foundation library resolves
 * for every consumer of @deepseek-ai/cordis.
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
