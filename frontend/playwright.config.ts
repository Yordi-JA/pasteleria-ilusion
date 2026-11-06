import { defineConfig, devices } from '@playwright/test'

// `E2E_PORT` cambia el puerto cuando el 5173 ya lo ocupa otro servidor de desarrollo (por ejemplo, el de otro
// worktree): con `reuseExistingServer`, Playwright usaría ese servidor y probaría otro código sin avisar.
const port = process.env.E2E_PORT ?? '5173'
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: origin,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // La suite corre contra el servidor de desarrollo de Vite, no contra `vite preview`: `api-client.spec.ts`
  // importa módulos de `/src` en el navegador y `storeInfo.ts` solo acepta el corte de tiempo de las pruebas en DEV.
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: true,
  },
})
