/**
 * api/sigpac-bbox.js
 * Proxy serverless para la OGC API de SIGPAC (FEGA).
 * Recibe ?west=X&south=Y&east=X&north=Y y devuelve TODOS los recintos
 * dentro del bbox con geometría completa + uso_sigpac por MVT.
 *
 * Diferencias respecto a api/sigpac.js (punto único):
 *  - Acepta bbox real del polígono dibujado (no delta artificial)
 *  - Limit 50 recintos (suficiente para polígonos 0.5–3 ha en Campo de Cartagena)
 *  - Enriquece uso_sigpac para CADA recinto individualmente
 *  - Las geometrías se devuelven completas para intersección con Turf.js en cliente
 *
 * Resiliencia (rev. 2026-05-15):
 *  - Reintento con backoff ante 502/503/504/429 y errores de red en el OGC API.
 *  - Timeout del fetch OGC coherente con maxDuration de vercel.json.
 *  NOTA: este endpoint NO hace enriquecimiento MVT (lee uso/uso_sigpac/cod_uso
 *  de las properties de la OGC API). No reintroducir el fan-out MVT. Las
 *  funciones lonLatToTile / _fetchMVT / getUsoForRecinto quedan como código
 *  muerto de una versión anterior; se pueden limpiar aparte.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura)
 */

const OGC_TIMEOUT_MS  = 6000
const OGC_MAX_RETRIES = 2     // 1 intento + 2 reintentos

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

function lonLatToTile(lon, lat, z) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, z))
  const latRad = lat * Math.PI / 180
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z)
  )
  return { x, y, z }
}

async function _fetchMVT(z, x, y) {
  const url = `https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/${z}/${x}/${y}.geojson`
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 8000)
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

/**
 * Obtiene uso_sigpac para un recinto usando el centroide de su geometría.
 * Busca en grid 3×3 teselas zoom=16, fallback zoom=15.
 */
async function getUsoForRecinto(props, geometry) {
  // Calcular centroide aproximado del recinto para localizar la tesela
  let lon, lat
  try {
    const coords = geometry?.type === 'MultiPolygon'
      ? geometry.coordinates[0][0]
      : geometry?.coordinates?.[0]
    if (!coords?.length) return null
    lon = coords.reduce((s, c) => s + c[0], 0) / coords.length
    lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  } catch {
    return null
  }

  const ref = {
    provincia: Number(props.provincia),
    municipio: Number(props.municipio),
    poligono:  Number(props.poligono),
    parcela:   Number(props.parcela),
    recinto:   Number(props.recinto),
  }

  for (const z of [16, 15]) {
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
      const match = tile.features.find(f => {
        const p = f.properties
        return (
          Number(p.provincia) === ref.provincia &&
          Number(p.municipio) === ref.municipio &&
          Number(p.poligono)  === ref.poligono  &&
          Number(p.parcela)   === ref.parcela   &&
          Number(p.recinto)   === ref.recinto
        )
      })
      if (match?.properties?.uso_sigpac) return match.properties.uso_sigpac
    }
  }
  return null
}

export default async function handler(req, res) {
  const { west, south, east, north } = req.query

  if (!west || !south || !east || !north) {
    return res.status(400).json({ error: 'Parámetros west, south, east, north requeridos' })
  }

  const [w, s, e, n] = [west, south, east, north].map(parseFloat)
  if ([w, s, e, n].some(isNaN)) {
    return res.status(400).json({ error: 'Coordenadas bbox deben ser números' })
  }

  // Seguridad: limitar bbox a ~5km² máximo (evitar consultas abusivas)
  const maxDelta = 0.05  // ~5.5km en latitud, ~4.4km en longitud a 37°N
  if ((e - w) > maxDelta || (n - s) > maxDelta) {
    return res.status(400).json({ error: 'Bbox demasiado grande (máx. ~5km²)' })
  }

  // ── 1. OGC API → recintos en bbox ─────────────────────────────────────────
  const bboxStr = `${w},${s},${e},${n}`
  const ogcUrl  =
    `https://sigpac-hubcloud.es/ogcapi/collections/recintos/items` +
    `?f=json&bbox=${bboxStr}&limit=50`

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
    return res.status(200).json({ type: 'FeatureCollection', features: [] })
  }

  // ── 2. Normalizar uso_sigpac desde las properties de la OGC API ───────
  // (Antes haciamos un enriquecimiento extra via MVT, pero sigpac-hubcloud
  //  esta devolviendo 404 sistematicamente al MVT y disparaba el tiempo de
  //  respuesta a varios minutos. La OGC API ya expone el uso en `uso`,
  //  `uso_sigpac` o `cod_uso` segun el recinto.)
  const enriched = data.features.map(f => ({
    ...f,
    properties: {
      ...f.properties,
      uso_sigpac:
        f.properties.uso_sigpac ?? f.properties.uso ?? f.properties.cod_uso ?? null,
    },
  }))

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  return res.status(200).json({ type: 'FeatureCollection', features: enriched })
}
