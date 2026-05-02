import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Note: environmentMatchGlobs was removed in vitest v4.
    // Per-file environments are set with inline @vitest-environment annotations.
    // tests/db.test.ts and tests/search.test.ts must add: // @vitest-environment node at the top of the file
  },
})
