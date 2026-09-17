import { defineConfig } from 'vitest/config'

// Unit tests cover the framework-independent core (model, operations, time math).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
