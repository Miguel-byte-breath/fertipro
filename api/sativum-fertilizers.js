/**
 * api/sativum-fertilizers.js — proxy serverless para fertilizantes Sativum
 *
 * Discrimina tres operaciones según método HTTP y parámetro `id`:
 *
 *   GET  /api/sativum-fertilizers          → lista completa (1253 productos)
 *   GET  /api/sativum-fertilizers?id=123   → detalle de un fertilizante
 *   POST /api/sativum-fertilizers          → recomendación de combinaciones
 *
 * Endpoints upstream (base: https://gateway.api.itacyl.es/sativum):
 *   GET  /nutrients/fertilizers
 *   GET  /nutrients/fertilizers/{id}
 *   POST /nutrients/fertilizers/recommendation
 *
 * NOTAS DE IMPLEMENTACIÓN:
 *   - Lista: cache s-maxage=1800 (el catálogo cambia muy poco).
 *   - Recomendación: id=0 en todos los productos → usar extractFertilizerId()
 *     para parsear el ID real de links[0].href.
 *   - Asimetría lista/detalle: lista usa cao/mgo/so3/na2o,
 *     detalle usa ca/mg/s/na. Normalizar solo en detalle.
 *   - npkToCover siempre en UF: N, P₂O₅, K₂O.
 *
 * VARIABLES DE ENTORNO:
 *   SATIVUM_API_KEY   (requerida)
 *   SATIVUM_BASE_URL  (opcional)
 */

const DEFAULT_BASE_URL = 'https://gateway.api.itacyl.es/sativum'

export default async function handler(req, res) {
  const apikey  = process.env.SATIVUM_API_KEY
  const baseUrl = (process.env.SATIVUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

  if (!apikey) {
    return res.status(503).json({
      error:  'Sativum no configurado',
      detail: 'Define SATIVUM_API_KEY en las variables de entorno de Vercel.',
      stub:   true,
    })
  }

  const { id } = req.query

  // ── POST → recomendación ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    return proxyPost(
      `${baseUrl}/nutrients/fertilizers/recommendation`,
      req.body,
      apikey,
      res,
      { cache: false }
    )
  }

  // ── GET con id → detalle ────────────────────────────────────────────────────
  if (req.method === 'GET' && id) {
    return proxyGet(
      `${baseUrl}/nutrients/fertilizers/${encodeURIComponent(id)}`,
      apikey,
      res,
      { cache: 's-maxage=3600, stale-while-revalidate=7200' }
    )
  }

  // ── GET sin id → lista completa ─────────────────────────────────────────────
  if (req.method === 'GET') {
    return proxyGet(
      `${baseUrl}/nutrients/fertilizers`,
      apikey,
      res,
      { cache: 's-maxage=1800, stale-while-revalidate=7200' }
    )
  }

  return res.status(405).json({ error: 'Método no permitido.' })
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function proxyGet(url, apikey, res, { cache }) {
  try {
    const { data, status } = await fetchUpstream(url, 'GET', null, apikey)
    if (status !== 200) {
      return res.status(status).json(data)
    }
    if (cache) res.setHeader('Cache-Control', cache)
    return res.status(200).json(data)
  } catch (err) {
    return handleError(err, res)
  }
}

async function proxyPost(url, body, apikey, res, { cache }) {
  try {
    const { data, status } = await fetchUpstream(url, 'POST', body, apikey)
    if (status !== 200) {
      return res.status(status).json(data)
    }
    if (cache) res.setHeader('Cache-Control', cache)
    return res.status(200).json(data)
  } catch (err) {
    return handleError(err, res)
  }
}

async function fetchUpstream(url, method, body, apikey) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 15000)

  let upstream
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        apikey,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  const text = await upstream.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { error: 'Respuesta no parseable de Sativum', detail: text.slice(0, 500) }
    return { data, status: 502 }
  }

  if (!upstream.ok) {
    return {
      data: { error: `Sativum respondió ${upstream.status}`, detail: data },
      status: upstream.status,
    }
  }

  return { data, status: 200 }
}

function handleError(err, res) {
  if (err.name === 'AbortError') {
    return res.status(504).json({ error: 'Timeout conectando con Sativum' })
  }
  return res.status(502).json({ error: 'Error conectando con Sativum', detail: err.message })
}
