/**
 * api/sigpac.js
 * Proxy serverless para la OGC API de SIGPAC (FEGA).
 * Recibe ?lon=X&lat=Y y devuelve el recinto SIGPAC enriquecido con uso_sigpac.
 *
 * Flujo:
 *  1. OGC API HubCloud → recinto (geometría + atributos básicos)
 *  2. MVT HubCloud (z16→z15) → uso_sigpac del feature coincidente
 *  3. Si MVT falla → se devuelve el recinto sin uso (nunca bloquea)
 *
 * Resiliencia (rev. 2026-05-15):
 *  - Reintento con backoff ante 502/503/504/429 y errores de red en el OGC API.
 *    SIGPAC devuelve 502 transitorios con cierta frecuencia; ya no se propagan
 *    al usuario al primer intento.
 *  - Timeouts internos coherentes con maxDuration de vercel.json.
 *  - Guard de tiempo en el enriquecimiento MVT.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura)
 */

// ── Presupuesto de tiempo (maxDuration en vercel.json = 30s) ────────────────
const FUNCTION_BUDGET_MS = 22000
const OGC_TIMEOUT_MS     = 6000
const OGC_MAX_RETRIES    = 2     // 1 intento + 2 reintentos
const MVT_TIMEOUT_MS     = 3000

/**
 * Convierte coordenadas lon/lat (WGS84) a índices de tesela XYZ en zoom z.
 */
function lonLatToTile(lon, lat, z) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, z))
  const latRad = lat * Math.PI / 180
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z)
  )
  return { x, y, z }
}

/**
 * fetch con AbortController + reintento con backoff exponencial.
 * Reintenta ante 502/503/504/429 y ante errores de red (incluido timeout).
 * Devuelve la Response (sea ok o no); lanza si agota reintentos por error de red.
 */
async function fetchConReintento(url, { timeoutMs, maxRetries, headers }) {
  let ultimoError
  for (let intento = 0; intento <= maxRetries; intento++) {
    if (intento > 0) {
      // backoff: 400ms, 800ms, 1600ms...
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, intento - 1)))
    }
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers, signal: controller.signal })
      clearTimeout(timeoutId)
      if ([502, 503, 504, 429].includes(res.status) && intento < maxRetries) {
        ultimoError = new Error(`upstream ${res.status}`)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timeoutId)
      ultimoError = err
      if (intento >= maxRetries) throw err
    }
  }
  throw ultimoError || new Error('fetchConReintento: agotados los reintentos')
}

async function _fetchMVT(z, x, y) {
  const url = `https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/${z}/${x}/${y}.geojson`
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), MVT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Clave única de recinto: provincia:municipio:poligono:parcela:recinto */
function refKey(p) {
  return [p.provincia, p.municipio, p.poligono, p.parcela, p.recinto]
    .map(Number).join(':')
}

/**
 * Descarga teselas MVT GeoJSON y extrae el uso_sigpac del recinto coincidente.
 * Para el zoom dado prueba la tesela central más las 8 vecinas (grid 3×3)
 * para cubrir recintos en bordes de tesela.
 */
async function _buscarEnTeselas(lon, lat, z, refK) {
  const { x, y } = lonLatToTile(lon, lat, z)

  const offsets = [
    [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]

  const tiles = await Promise.all(
    offsets.map(([dx, dy]) => _fetchMVT(z, x + dx, y + dy))
  )

  for (const tile of tiles) {
    if (!tile?.features?.length) continue
    const match = tile.features.find(f => refKey(f.properties) === refK)
    if (match?.properties?.uso_sigpac) return match.properties.uso_sigpac
  }
  return null
}

/**
 * Intenta en zoom=16 primero (teselas más pequeñas → match más fiable),
 * luego zoom=15 como fallback. Respeta el presupuesto de tiempo.
 */
async function getUsoSigpacFromMVT(lon, lat, refK, start) {
  for (const z of [16, 15]) {
    if (Date.now() - start > FUNCTION_BUDGET_MS) break
    const uso = await _buscarEnTeselas(lon, lat, z, refK)
    if (uso) return uso
  }
  return null
}

export default async function handler(req, res) {
  const start = Date.now()
  const { lon, lat } = req.query

  if (!lon || !lat) {
    return res.status(400).json({ error: 'Parámetros lon y lat requeridos' })
  }

  const lonF = parseFloat(lon)
  const latF = parseFloat(lat)

  if (isNaN(lonF) || isNaN(latF)) {
    return res.status(400).json({ error: 'lon/lat deben ser números' })
  }

  // ── 1. OGC API → recinto (con reintento ante 502/503) ───────────────────
  const delta = 0.0001
  const bbox = `${lonF - delta},${latF - delta},${lonF + delta},${latF + delta}`
  const ogcUrl =
    `https://sigpac-hubcloud.es/ogcapi/collections/recintos/items` +
    `?f=json&bbox=${bbox}&limit=5`

  let data
  try {
    const upstream = await fetchConReintento(ogcUrl, {
      timeoutMs: OGC_TIMEOUT_MS,
      maxRetries: OGC_MAX_RETRIES,
      headers: { Accept: 'application/geo+json' },
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `SIGPAC OGC respondió ${upstream.status}`,
      })
    }

    data = await upstream.json()
  } catch (err) {
    return res.status(502).json({ error: 'Error conectando con SIGPAC', detail: err.message })
  }

  if (!data.features?.length) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)
  }

  // ── 2. MVT → uso_sigpac (enriquecimiento, NO bloquea la respuesta) ──────
  const refK = refKey(data.features[0].properties)

  let uso_sigpac = null
  try {
    uso_sigpac = await getUsoSigpacFromMVT(lonF, latF, refK, start)
  } catch {
    // El enriquecimiento nunca debe tumbar la respuesta del recinto
    uso_sigpac = null
  }

  // Inyectar uso_sigpac en todos los features (por si el bbox devuelve varios)
  if (uso_sigpac) {
    data.features = data.features.map(f => ({
      ...f,
      properties: { ...f.properties, uso_sigpac },
    }))
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  return res.status(200).json(data)
}
