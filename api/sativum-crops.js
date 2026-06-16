/**
 * api/sativum-crops.js — proxy serverless para el catálogo de cultivos Sativum
 *
 * Endpoint upstream: GET /nutrients/crops
 *   https://gateway.api.itacyl.es/sativum/nutrients/crops
 *
 * Devuelve el catálogo completo de cultivos con sus parámetros agronómicos
 * (HI, concentraciones N/P/K en órganos cosechados, f_res, nfix_code, etc.)
 * necesarios para alimentar el motor FertiliCalc (/fertilicalc/algo/).
 *
 * USO desde frontend:
 *   GET /api/sativum-crops            → catálogo completo
 *   GET /api/sativum-crops?name=Cebada → filtrado por nombre (case-insensitive)
 *   GET /api/sativum-crops?group=Cereals → filtrado por plantSpeciesGroup
 *
 * NOTAS DE IMPLEMENTACIÓN:
 *   - La spec OpenAPI describe un wrapper `{ items: [] }` que NO existe en
 *     producción — la respuesta real es un array plano directamente.
 *   - upstream devuelve Cache-Control: no-cache → lo sobreescribimos en el edge.
 *   - plantSpeciesGroup viene capitalizado mixto ("Cereals", "Forage_legume") →
 *     normalizar con .toUpperCase() antes de pasarlo al motor /algo/.
 *   - Anomalía conocida: yieldMedium < yieldLow en id=147 (Cebada forraje) →
 *     la UI debe mostrar aviso defensivo en CultivoCard.
 *
 * VARIABLES DE ENTORNO:
 *   SATIVUM_API_KEY   (requerida)
 *   SATIVUM_BASE_URL  (opcional) por defecto https://gateway.api.itacyl.es/sativum
 */

const DEFAULT_BASE_URL = 'https://gateway.api.itacyl.es/sativum'

export default async function handler(req, res) {
  const { name, group } = req.query

  const apikey  = process.env.SATIVUM_API_KEY
  const baseUrl = (process.env.SATIVUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

  if (!apikey) {
    return res.status(503).json({
      error:  'Sativum no configurado',
      detail: 'Define SATIVUM_API_KEY en las variables de entorno de Vercel.',
      stub:   true,
    })
  }

  const url = `${baseUrl}/nutrients/crops`

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    let upstream
    try {
      upstream = await fetch(url, {
        headers: {
          Accept: 'application/json',
          apikey,
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({
        error:  `Sativum respondió ${upstream.status}`,
        detail: text.slice(0, 500),
      })
    }

    let data = await upstream.json()

    // La respuesta real es un array plano, pero por si la spec cambia algún día
    if (data && !Array.isArray(data) && Array.isArray(data.items)) {
      data = data.items
    }

    // Filtros opcionales en el edge (evita transferir 150+ cultivos al cliente)
    if (name) {
      const re = new RegExp(name, 'i')
      data = data.filter(c => re.test(c.name ?? ''))
    }
    if (group) {
      const re = new RegExp(group, 'i')
      data = data.filter(c => re.test(c.plantSpeciesGroup ?? ''))
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')
    return res.status(200).json(data)

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout conectando con Sativum' })
    }
    return res.status(502).json({
      error:  'Error conectando con Sativum',
      detail: err.message,
    })
  }
}
