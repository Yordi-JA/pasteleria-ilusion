import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sin mapas de fuente: el build se sirve en producción y no debe exponer el código.
  build: { sourcemap: false },
  // three y react-three-fiber solo se importan desde el chunk diferido de la escena 3D (D48). Sin esto, Vite los
  // descubre al pedir ese chunk, los vuelve a empaquetar y recarga la página en desarrollo.
  optimizeDeps: { include: ['three', '@react-three/fiber'] },
  server: {
    // IPv4 explícito: en esta máquina el loopback IPv6 (::1) no responde.
    host: '127.0.0.1',
    // Las fuentes y los logos viven en assets/, fuera de frontend/, y la escena 3D lee los colores de
    // design/tokens.json (D48). Se permiten solo esas rutas además de frontend/, para no exponer el resto del repositorio.
    fs: { allow: ['.', '../assets/fuentes', '../assets/logos', '../design/tokens.json'] },
    // La API vive en el mismo origen bajo /api (D15). IPv4 explícito por la
    // misma razón que host: runserver de Django escucha en 127.0.0.1.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
