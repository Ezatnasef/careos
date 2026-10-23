import { defineConfig, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiPort = process.env.CAREOS_E2E_API_PORT || '8000'
const webPort = process.env.CAREOS_E2E_WEB_PORT || '5173'
const pythonExecutable = process.env.CAREOS_E2E_PYTHON || 'python'
const projectRoot = dirname(fileURLToPath(import.meta.url))
const e2eDatabaseDirectory = resolve(projectRoot, 'backend', '.e2e-databases')
mkdirSync(e2eDatabaseDirectory, { recursive: true })
const e2eDatabaseName = `careos-e2e-${process.pid}-${randomUUID()}.db`
const e2eDatabaseUrl = `sqlite+aiosqlite:///./.e2e-databases/${e2eDatabaseName}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'on-first-retry' },
  webServer: [
    {
      // E2E writes data, so never reuse a listener whose environment/database is unknown.
      command: `"${pythonExecutable}" -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: 'backend',
      env: { APP_ENV: 'test', DATABASE_URL: e2eDatabaseUrl },
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      env: { CAREOS_E2E_API_PORT: apiPort },
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-gpu'] } } }],
})
