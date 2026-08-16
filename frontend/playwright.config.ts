import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/stack';

/**
 * E2E configuration.
 *
 * The suite drives the stack in `docker-compose.e2e.yml` — a real Express
 * backend, a real Postgres, and the production Vite build behind the production
 * Caddy config. Nothing here mocks the API; see that file for why the stack is
 * separate from the one `docker compose up` starts.
 *
 * globalSetup brings it up and globalTeardown takes it down, so `npm run e2e`
 * needs no preamble beyond a running Docker.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Every test seeds its own account, so they do not contend for data. They do
  // share one backend, and the point of the suite is a reproducible balance —
  // one worker keeps a slow assertion from racing another test's writes.
  workers: 1,
  fullyParallel: false,

  // A retry that turns a failure green hides a flaky wait, which is the failure
  // mode this suite exists to avoid. CI retries once so an infrastructure blip
  // does not fail a whole run, and the trace says which it was.
  retries: process.env['CI'] ? 1 : 0,
  forbidOnly: !!process.env['CI'],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /*
   * Two projects against the same stack.
   *
   * `mobile` runs a subset rather than a copy of the desktop suite. Below
   * 640px the app renders a different shell — bottom tab bar, day detail as a
   * sheet, cards instead of tables — and only the flows that shell actually
   * changes are worth running twice. Re-running every desktop spec at a narrow
   * viewport would double maintenance to re-assert behaviour that does not
   * differ.
   *
   * The split is by filename so it stays obvious from the file tree which
   * shell a spec is about, and so neither project can silently pick up the
   * other's tests.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /\.mobile\.spec\.ts$/,
    },
    {
      // 393x851 — within a pixel of the handoff's 393x852 reference.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /\.mobile\.spec\.ts$/,
    },
  ],
});
