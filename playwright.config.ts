import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL, POORT } from './tests/e2e/gegevens';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${POORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${POORT}`,
    url: `http://localhost:${POORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${POORT}`,
      GOOGLE_MAPS_API_KEY: '',
      NTFY_URL: '',
      BIJLAGEN_MAP: path.join(os.tmpdir(), 'takenbord-e2e-bijlagen'),
    },
  },
});
