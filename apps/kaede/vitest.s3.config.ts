import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/storage/support/global-setup.ts'],
    setupFiles: ['./tests/storage/support/setup.ts'],
    include: ['tests/storage/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
    fileParallelism: false,
  },
})
