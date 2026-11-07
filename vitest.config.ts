import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const node = (name: string, include: string[]) => ({
  test: { name, environment: 'node' as const, include, testTimeout: 20000, hookTimeout: 30000 },
});

export default defineConfig({
  test: {
    // Every server test file runs its own local D1 engine (workerd). With one worker per
    // core the machine runs out of memory and CPU, and calls to the engine fail with
    // "fetch failed" and timeouts. Eight workers are as fast and stay stable.
    maxWorkers: 8,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      // The node projects are split by area, so `vitest --project server` runs one.
      // The server tests share one local D1 engine per file (server/test/testApi.ts).
      node('shared', ['shared/**/*.test.ts', 'scripts/**/*.test.ts']),
      node('server', ['server/**/*.test.ts']),
      node('runner', ['runner/**/*.test.ts']),
    ],
  },
});
