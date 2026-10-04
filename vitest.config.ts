import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Convex function tests opt into the edge-runtime environment per file
    // (`// @vitest-environment edge-runtime`), matching the Convex runtime.
    server: { deps: { inline: ['convex-test'] } },
  },
});
