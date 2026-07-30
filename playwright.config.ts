/**
 * Playwright — the acceptance harness (CLAUDE.md "Development workflow").
 * One spec per hard invariant or acceptance criterion, in ./e2e, run in
 * real Chromium against the Vite dev server. IndexedDB is real here; do
 * not mock inside the app — use Playwright emulation (emulateMedia etc.).
 */
import { defineConfig, devices } from '@playwright/test';

/**
 * Sandboxed agent environments (e.g. cloud sessions) cannot download
 * browsers but ship a preinstalled Chromium; point this env var at its
 * executable there. Unset on a normal dev machine — `npx playwright
 * install chromium` is the usual path.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
