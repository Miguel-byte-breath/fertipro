import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * vite.config.js — FertiPRO
 *
 * En desarrollo local, redirige /api/* a las funciones serverless desplegadas
 * en Vercel para evitar CORS sin necesidad de `vercel dev`.
 *
 * Cuando el deploy esté en marcha, sustituye `target` por la URL real.
 * Mientras tanto, las llamadas a /api/* fallarán con 502 hasta que existan
 * las funciones serverless en producción — el resto de la app funciona.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // TODO: actualizar tras primer deploy
        target: 'https://fertipro.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
