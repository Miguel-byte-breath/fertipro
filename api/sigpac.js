/**
 * api/sigpac.js
 * Proxy serverless para la OGC API de SIGPAC (FEGA).
 * Recibe ?lon=X&lat=Y y devuelve el recinto SIGPAC enriquecido con uso_sigpac.
 *
 * Flujo:
 *  1. OGC API HubCloud → recinto (geometría + atributos básicos)
 *  2. MVT HubCloud (z15) → uso_sigpac del feature coincidente
 *  3. Si MVT falla → se devuelve el recinto sin uso (nunca bloquea)
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura)
 */

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
 * Descarga teselas MVT GeoJSON y extrae el uso_sigpac del recinto coincidente.
 * Intenta en zoom=16 primero (teselas más pequeñas → match más fiable),
 * luego zoom=15 como fallback. Para cada zoom prueba la tesela central
 * más las 8 teselas vecinas (grid 3×3) para cubrir recintos en bordes de tesela.
 */
async function getUsoSigpacFromMVT(lon, lat, ref) {
  for (const z of [16, 15]) {
    const uso = await _buscarEnTeselas(lon, lat, z, ref)
    if (uso) return uso
  }
  return null
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

async function _buscarEnTeselas(lon, lat, z, ref) {
  const { x, y } = lonLatToTile(lon, lat, z)

  // Grid 3×3 centrado en la tesela del punto — cubre recintos en bordes de tesela
  const offsets = [
    [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]

  // Descargar todas las teselas en paralelo
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
  return null
}

export default async function handler(req, res) {
  const { lon, lat } = req.query

  if (!lon || !lat) {
    return res.status(400).json({ error: 'Parámetros lon y lat requeridos' })
  }

  const lonF = parseFloat(lon)
  const latF = parseFloat(lat)

  if (isNaN(lonF) || isNaN(latF)) {
    return res.status(400).json({ error: 'lon/lat deben ser números' })
  }

  // ── 1. OGC API → recinto ────────────────────────────────────────────────
  const delta = 0.0001
  const bbox = `${lonF - delta},${latF - delta},${lonF + delta},${latF + delta}`
  const ogcUrl =
    `https://sigpac-hubcloud.es/ogcapi/collections/recintos/items` +
    `?f=json&bbox=${bbox}&limit=5`

  let data
  try {
    const ogcController = new AbortController()
    const ogcTimeoutId  = setTimeout(() => ogcController.abort(), 8000)
    let upstream
    try {
      upstream = await fetch(ogcUrl, {
        headers: { Accept: 'application/geo+json' },
        signal: ogcController.signal,
      })
    } finally {
      clearTimeout(ogcTimeoutId)
    }

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

  // ── 2. MVT → uso_sigpac (enriquecimiento, no bloquea) ──────────────────
  const firstProps = data.features[0].properties
  const ref = {
    provincia: Number(firstProps.provincia),
    municipio: Number(firstProps.municipio),
    poligono:  Number(firstProps.poligono),
    parcela:   Number(firstProps.parcela),
    recinto:   Number(firstProps.recinto),
  }

  const uso_sigpac = await getUsoSigpacFromMVT(lonF, latF, ref)

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
