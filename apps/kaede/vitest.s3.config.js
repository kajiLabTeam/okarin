import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globalSetup: ['./tests/storage/global-setup.ts'],
    setupFiles: ['./tests/storage/setup.ts'],
    include: ['tests/storage/**/*.test.ts'],
    fileParallelism: false,
  },
})
