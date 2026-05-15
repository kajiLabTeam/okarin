import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/db/global-setup.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    include: ['tests/routes/**/*.test.ts', 'tests/services/**/*.test.ts'],
    fileParallelism: false,
  },
})
