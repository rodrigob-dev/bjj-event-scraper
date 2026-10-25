import { defineConfig } from 'vitest/config';

// Pinned to this repo: without a config of its own, vite walks up the tree and
// picks any vitest/postcss config it meets on the way (it did, in $HOME).
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: { root: __dirname, include: ['test/**/*.test.ts'], environment: 'node' },
});
