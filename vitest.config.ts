import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: '.runs/vitest/unit-results.json' },
  },
});
