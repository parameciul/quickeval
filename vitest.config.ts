import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
