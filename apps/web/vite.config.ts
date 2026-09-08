import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Playwright specs live in e2e/ and are driven by `pnpm test:e2e`, not by Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
