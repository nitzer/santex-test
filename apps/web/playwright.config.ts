import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * Both ports are configurable so a run never has to fight for a port someone else is
 * using. Nothing in the contract pins either one: the app learns the API's address from
 * `VITE_API_URL`, and the API learns which origin to allow from `CORS_ORIGINS`.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 8000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * The run gets its own database and upload directory under the temp dir, so it never
 * touches `apps/api/actions.db` or the repo's storage — a developer's own server can
 * keep running against its own data while the suite runs.
 */
const E2E_DIR = join(tmpdir(), 'pending-actions-e2e');
const DB_FILE = join(E2E_DIR, 'e2e.db');
const UPLOADS_DIR = join(E2E_DIR, 'uploads');

export default defineConfig({
  testDir: './e2e',
  // One worker: the specs share one API process and one database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Deleting this run's own temp database is what makes the suite repeatable: the
      // API reseeds the four demo actions as pending only against an empty database.
      command: `mkdir -p ${E2E_DIR} && rm -f ${DB_FILE} && uv run uvicorn api.main:app --port ${API_PORT}`,
      cwd: '../api',
      url: `${API_URL}/health`,
      // Never reuse a server: a leftover one would carry state from a previous run.
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // uv installs under ~/.local/bin, which a non-login shell may not have on PATH.
        PATH: `${process.env.HOME ?? ''}/.local/bin:${process.env.PATH ?? ''}`,
        DATABASE_URL: `sqlite:///${DB_FILE}`,
        CORS_ORIGINS: WEB_URL,
        UPLOADS_DIR,
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      cwd: '.',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { VITE_API_URL: API_URL },
    },
  ],
});
