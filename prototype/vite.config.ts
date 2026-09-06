import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // vite has no /api routes; reuse the deployed Edge functions (wms, generate, zoning, geocode,
    // disaster)
    // so the dev server behaves like production. Routes not yet deployed return 404, which the UI
    // reports as "자동 판정 불가".
    proxy: {
      '/api': { target: 'https://grand-site-dc.vercel.app', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
