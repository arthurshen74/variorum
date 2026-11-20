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

const BASE_URL = 'http://localhost:5173';

/**
 * Every spec opens past the setup gate (DESIGN.md "First-Run Setup"): a
 * Models/Providers document with one endpoint and one model, under names
 * no spec uses. A spec that seeds its own document overwrites it; one that
 * needs a fresh machine sets an empty storageState.
 */
const DEFAULT_PROVIDER_DOCUMENT = {
  endpoints: [
    {
      id: 'e2e-default-endpoint',
      url: 'http://127.0.0.1:9/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'e2e-default-model', handle: 'e2e-default-model' }],
    },
  ],
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [
            {
              name: 'variorum.llm',
              value: JSON.stringify(DEFAULT_PROVIDER_DOCUMENT),
            },
          ],
        },
      ],
    },
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
