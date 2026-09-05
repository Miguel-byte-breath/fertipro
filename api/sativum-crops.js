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

/**
 * Llama al catalogo Sativum (/nutrients/crops) ya filtrado por name/group, y
 * devuelve el resultado clasificado en { ok:true, data } o
 * { ok:false, status, error } -- mismo convenio que identificarSativum() en
 * api/sativum-suelo.js.
 *
 * Extraida del handler HTTP de mas abajo (GET /api/sativum-crops) para que
 * api/sativum-crops-search.js (tool MCP search_crop) pueda reutilizar
 * exactamente la misma llamada upstream -- apikey, timeout, filtros -- sin
 * duplicarla. El handler por defecto sigue respondiendo exactamente igual
 * que antes: esta extraccion no cambia ningun status code ni forma de body.
 */
export async function buscarCultivosSativum({ name, group } = {}) {
  const apikey  = process.env.SATIVUM_API_KEY
  const baseUrl = (process.env.SATIVUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

  if (!apikey) {
    return {
      ok: false,
      status: 503,
      error: {
        error:  'Sativum no configurado',
        detail: 'Define SATIVUM_API_KEY en las variables de entorno de Vercel.',
        stub:   true,
      },
    }
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
      return {
        ok: false,
        status: upstream.status,
        error: {
          error:  `Sativum respondió ${upstream.status}`,
          detail: text.slice(0, 500),
        },
      }
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

    return { ok: true, data }

  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 504, error: { error: 'Timeout conectando con Sativum' } }
    }
    return {
      ok: false,
      status: 502,
      error: {
        error:  'Error conectando con Sativum',
        detail: err.message,
      },
    }
  }
}

export default async function handler(req, res) {
  const { name, group } = req.query

  const result = await buscarCultivosSativum({ name, group })

  if (!result.ok) {
    return res.status(result.status).json(result.error)
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')
  return res.status(200).json(result.data)
}
