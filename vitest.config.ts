import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const node = (name: string, include: string[], extra: { exclude?: string[]; env?: Record<string, string> } = {}) => ({
  test: { name, environment: 'node' as const, include, testTimeout: 20000, hookTimeout: 30000, ...extra },
});

// The server tests run on an in-process database (server/test/fastD1.ts).
// These files need the real local D1 (workerd): they count the rows D1 reads,
// apply the migrations as wrangler does, or compare the two engines. They run
// in the "d1" project, which every `npm test` includes.
const D1_FILES = [
  'server/db/testsCost.test.ts',
  'server/db/version.test.ts',
  'server/migrations.test.ts',
  'server/usageMigration.test.ts',
  'server/test/d1Parity.test.ts',
];

export default defineConfig({
  test: {
    // Three quarters of the cores (12 of 16 on the development PC): measured a
    // little faster than 8 or 16. Only the "d1" project still starts the local
    // workerd engine, one per file; it has few files, so it no longer limits
    // the workers.
    maxWorkers: '75%',
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          // One jsdom per worker, a new VM context per file: a new jsdom for
          // every file took a third of the run. The node projects keep the
          // default pool: workerd does not load in a VM context.
          pool: 'vmThreads',
          vmMemoryLimit: '1024MB',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      // The node projects are split by area, so `vitest --project server` runs one.
      // The server tests share one local D1 engine per file (server/test/testApi.ts).
      node('shared', ['shared/**/*.test.ts', 'scripts/**/*.test.ts']),
      node('server', ['server/**/*.test.ts'], { exclude: D1_FILES }),
      node('d1', D1_FILES, { env: { QE_TEST_DB: 'workerd' } }),
      node('runner', ['runner/**/*.test.ts']),
    ],
  },
});
