import { defineConfig, devices } from '@playwright/test'

const apiPort = process.env.CAREOS_E2E_API_PORT || '8000'
const webPort = process.env.CAREOS_E2E_WEB_PORT || '5173'
const pythonExecutable = process.env.CAREOS_E2E_PYTHON || 'python'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'on-first-retry' },
  webServer: [
    {
      command: `"${pythonExecutable}" -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: 'backend',
      env: { APP_ENV: 'test', DATABASE_URL: 'sqlite+aiosqlite:///./careos-e2e.db' },
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: true,
    },
    { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort}`, url: `http://127.0.0.1:${webPort}`, reuseExistingServer: true },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-gpu'] } } }],
})
