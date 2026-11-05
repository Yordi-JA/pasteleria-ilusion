import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // La suite corre contra el servidor de desarrollo de Vite, no contra `vite preview`: `api-client.spec.ts`
  // importa módulos de `/src` en el navegador y `storeInfo.ts` solo acepta el corte de tiempo de las pruebas en DEV.
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
})
