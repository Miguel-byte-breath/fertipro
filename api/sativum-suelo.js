/**
 * api/sativum.js — proxy serverless para Sativum (ITACyL)
 *
 * Endpoint upstream: ArcGIS REST `identify` operation.
 *   https://gateway.api.itacyl.es/sativumarcgis/MapServer/identify
 *
 * Devuelve la información de TODAS las capas del servicio Sativum en un punto.
 * Cada capa del MapServer puede aportar un resultado (suelos, clima, etc.).
 *
 * USO desde frontend:
 *   GET /api/sativum?lon=<lon>&lat=<lat>
 *   GET /api/sativum?lon=<lon>&lat=<lat>&layers=all
 *   GET /api/sativum?lon=<lon>&lat=<lat>&tolerance=10
 *
 * VARIABLES DE ENTORNO (Vercel → Project Settings → Environment Variables):
 *   SATIVUM_API_KEY     (requerida)  apikey de la pasarela ITACyL
 *   SATIVUM_BASE_URL    (opcional)   por defecto https://gateway.api.itacyl.es/sativumarcgis
 *
 * SEGURIDAD: la apikey nunca llega al cliente. El frontend siempre llama a
 * /api/sativum (mismo origen) y este handler añade el header `apikey` antes
 * de hacer el fetch al gateway.
 *
 * Licencia datos: ITACyL — JCYL · Sativum.
 */

const DEFAULT_BASE_URL  = 'https://gateway.api.itacyl.es/sativumarcgis'
const DEFAULT_TOLERANCE = 10
const DEFAULT_LAYERS    = 'all'
const DEFAULT_DPI       = 96
const DEFAULT_W         = 600
const DEFAULT_H         = 550

/**
 * Construye el bbox `mapExtent` a partir de un punto lon/lat.
 * ArcGIS lo necesita combinado con `imageDisplay` para calcular qué celdas
 * del raster intersecta la tolerancia. Para un identify puntual basta un
 * bbox pequeño centrado en el punto.
 */
function buildMapExtent(lon, lat, w = DEFAULT_W, h = DEFAULT_H) {
  // ~ 0.01° lon ≈ 1.1 km a 40°N — suficiente para localizar la celda central.
  const halfLon = 0.01 * (w / 600)
  const halfLat = 0.01 * (h / 600) * (h / w)
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat].join(',')
}

/**
 * Geometría del punto en formato esri (JSON serializado).
 */
function buildGeometry(lon, lat) {
  return JSON.stringify({
    x: lon,
    y: lat,
    spatialReference: { wkid: 4326 },
  })
}

export default async function handler(req, res) {
  const {
    lon, lat,
    layers    = DEFAULT_LAYERS,
    tolerance = DEFAULT_TOLERANCE,
  } = req.query

  if (!lon || !lat) {
    return res.status(400).json({ error: 'Parámetros `lon` y `lat` requeridos' })
  }

  const lonF = parseFloat(lon)
  const latF = parseFloat(lat)
  if (isNaN(lonF) || isNaN(latF)) {
    return res.status(400).json({ error: 'lon/lat deben ser números' })
  }

  const apikey  = process.env.SATIVUM_API_KEY
  const baseUrl = process.env.SATIVUM_BASE_URL || DEFAULT_BASE_URL

  if (!apikey) {
    return res.status(503).json({
      error:  'Sativum no configurado',
      detail: 'Define SATIVUM_API_KEY en las variables de entorno de Vercel.',
      stub:   true,
    })
  }

  const params = new URLSearchParams({
    f:              'json',
    geometryType:   'esriGeometryPoint',
    sr:             '4326',
    layers,
    tolerance:      String(tolerance),
    imageDisplay:   `${DEFAULT_W},${DEFAULT_H},${DEFAULT_DPI}`,
    returnGeometry: 'false',
    geometry:       buildGeometry(lonF, latF),
    mapExtent:      buildMapExtent(lonF, latF),
  })

  const url = `${baseUrl.replace(/\/$/, '')}/MapServer/identify?${params.toString()}`

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)

    let upstream
    try {
      upstream = await fetch(url, {
        headers: {
          Accept: 'application/json',
          apikey,        // header literal exigido por la pasarela ITACyL
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

    const data = await upstream.json()

    // ArcGIS a veces devuelve 200 con error embebido en el body
    if (data?.error) {
      return res.status(502).json({
        error:  'Error upstream Sativum',
        detail: data.error,
      })
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({
      error:  'Error conectando con Sativum',
      detail: err.message,
    })
  }
}
