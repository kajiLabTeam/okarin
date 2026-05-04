import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/db/global-setup.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
  },
})
