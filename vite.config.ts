import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const apiPort = loadEnv(mode, '.', '').CAREOS_E2E_API_PORT || '8000'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
  }
})
