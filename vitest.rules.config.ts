import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Security-rules tests need the Firebase emulators: run them with `npm run test:rules`.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
