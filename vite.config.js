import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * vite.config.js — FertiPRO
 *
 * En desarrollo local, `npm run dev` redirige /api/* a las funciones
 * serverless desplegadas en https://fertipro.vercel.app para evitar CORS
 * y poder probar SIGPAC + Sativum sin necesidad de `vercel dev` ni de
 * mantener credenciales upstream en local.
 *
 * En producción, las mismas funciones se sirven directamente desde Vercel.
 * Mismo código frontend en ambos entornos, sin cambios.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://fertipro.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
