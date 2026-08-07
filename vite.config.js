import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Única fuente de verdad del número de versión: el campo "version" de este
// mismo package.json. Se inyecta en el bundle como constante global
// (__APP_VERSION__) para que App.jsx nunca vuelva a llevar un string
// hardcodeado por su cuenta — evita el bug de sesiones anteriores donde
// package.json (0.1.0) y el footer de App.jsx (v0.2.0, a fuego) llevaban
// años sin hablarse entre sí. __BUILD_DATE__ es automático (fecha del
// propio build/deploy) — no hay un segundo valor manual que mantener
// sincronizado con la versión.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://fertipro.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
