/**
 * api/plan-riego.js — proxy serverless para el plan de riego (SIG Riego Pro)
 *
 * Endpoint upstream: POST /api/calcular-riego
 *   https://sig-riego-rdc-siar-pm.vercel.app/api/calcular-riego
 *
 * Recibe: { lat, lon, cultivo, fecha_ini, fecha_fin, vol_disponible? }
 * Devuelve: { ok, redistribucion_termica, programacion_semanal[], balance_mensual[] }
 *
 * No requiere API key — el endpoint upstream es público.
 */

const UPSTREAM = 'https://sig-riego-rdc-siar-pm.vercel.app/api/calcular-riego'
const TIMEOUT_MS = 20000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' })
  }

  const { lat, lon, cultivo, fecha_ini, fecha_fin, vol_disponible } = req.body || {}

  if (lat == null || lon == null || !cultivo || !fecha_ini || !fecha_fin) {
    return res.status(400).json({
      error: 'Parámetros requeridos: lat, lon, cultivo, fecha_ini, fecha_fin',
    })
  }

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let upstream
    try {
      upstream = await fetch(UPSTREAM, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        // origen:'sativum' — le dice a calcular-riego.js que busque solo en
        // cultivos_sativum.json, no en el catálogo canónico del gemelo FertiPRO
        // (motor propio). Ver CLAUDE.md, sesión 2026-07-10 ("separación por origen").
        body:    JSON.stringify({ lat, lon, cultivo, fecha_ini, fecha_fin, vol_disponible, origen: 'sativum' }),
        signal:  controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const raw = await upstream.text()
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(502).json({
        error:  'Respuesta no parseable de SIG Riego',
        detail: raw.slice(0, 500),
      })
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error:  `SIG Riego respondió ${upstream.status}`,
        detail: data?.error || raw.slice(0, 500),
      })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout conectando con SIG Riego' })
    }
    return res.status(502).json({
      error:  'Error conectando con SIG Riego',
      detail: err.message,
    })
  }
}
