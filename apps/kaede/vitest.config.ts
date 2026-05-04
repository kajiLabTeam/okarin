import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/db/global-setup.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
