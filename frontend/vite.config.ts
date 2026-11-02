import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // IPv4 explícito: en esta máquina el loopback IPv6 (::1) no responde.
    host: '127.0.0.1',
    // Las fuentes viven en assets/fuentes/, fuera de frontend/. Se permite solo
    // esa carpeta además de frontend/, para no exponer el resto del repositorio.
    fs: { allow: ['.', '../assets/fuentes'] },
    // La API vive en el mismo origen bajo /api (D15). IPv4 explícito por la
    // misma razón que host: runserver de Django escucha en 127.0.0.1.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
