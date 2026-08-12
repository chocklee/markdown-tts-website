import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
