import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Files share Postgres and the `ai.jobs` queue: in parallel, one file's app consumes another's jobs.
    fileParallelism: false,
  },
});
