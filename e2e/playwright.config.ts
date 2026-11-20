import { defineConfig } from '@playwright/test';

/**
 * End-to-end test of the critical path against a RUNNING stack (API + MediaMTX + Postgres):
 *   fake USB camera -> technician console -> WHIP -> MediaMTX -> WHEP -> customer phone viewer.
 * Start the stack first (see docs/INSTALL.he.md), then: E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
    screenshot: 'off',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
