/**
 * api/sativum-algo.js — proxy serverless para el cálculo NPK de Sativum
 *
 * Endpoint upstream: POST /fertilicalc/algo/
 *   https://gateway.api.itacyl.es/sativum/fertilicalc/algo/
 *
 * Recibe el body ya ensamblado desde src/api/sativum-algo.js,
 * añade la apikey y gestiona el bug de Content-Type upstream.
 *
 * ⚠️  TRAMPAS CONOCIDAS:
 *   1. La URL upstream DEBE terminar en barra: /fertilicalc/algo/
 *   2. El upstream devuelve Content-Type: text/html aunque el body
 *      sea JSON válido → usar JSON.parse(await res.text()) en lugar
 *      de res.json() para evitar error de parseo.
 *
 * VARIABLES DE ENTORNO:
 *   SATIVUM_API_KEY   (requerida)
 *   SATIVUM_BASE_URL  (opcional) por defecto https://gateway.api.itacyl.es/sativum
 */

import { postSativumAlgo } from '../src/api/sativum-http.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' })
  }

  try {
    // Mecanismo de bajo nivel (apikey + fetch + timeout/abort) compartido
    // con api/sativum-plan.js vía src/api/sativum-http.js. Este handler
    // conserva su propio contrato de respuesta (forma de error, status
    // codes, stub 503) tal cual estaba — el helper solo hace la llamada.
    const { status, ok, raw } = await postSativumAlgo(req.body)

    if (!ok) {
      return res.status(status).json({
        error:  `Sativum respondió ${status}`,
        detail: raw.slice(0, 500),
      })
    }

    // ⚠️ Defensive parsing: upstream devuelve Content-Type: text/html
    // aunque el body sea JSON válido
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(502).json({
        error:  'Respuesta no parseable de Sativum',
        detail: raw.slice(0, 500),
      })
    }

    if (data?.error) {
      return res.status(502).json({
        error:  'Error upstream Sativum',
        detail: data.error,
      })
    }

    // No cacheamos: cada cálculo depende de inputs del usuario
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)

  } catch (err) {
    if (err.code === 'SATIVUM_NOT_CONFIGURED') {
      return res.status(503).json({
        error:  'Sativum no configurado',
        detail: 'Define SATIVUM_API_KEY en las variables de entorno de Vercel.',
        stub:   true,
      })
    }
    if (err.code === 'SATIVUM_TIMEOUT' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout conectando con Sativum' })
    }
    return res.status(502).json({
      error:  'Error conectando con Sativum',
      detail: err.message,
    })
  }
}
