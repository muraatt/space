import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'artifacts/session-01/unit-results.json' },
  },
});
