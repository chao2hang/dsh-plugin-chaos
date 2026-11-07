import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'lib/index.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: { alwaysBundle: [/@deepseek-ai\//] },
})
