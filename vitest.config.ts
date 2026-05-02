import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Note: environmentMatchGlobs was removed in vitest v4.
    // Per-file environments are set with @vitest-environment docstrings.
    // tests/db.test.ts and tests/search.test.ts should use:
    //   // @vitest-environment node
  },
})
