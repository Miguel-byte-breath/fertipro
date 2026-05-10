/**
 * api/sigpac-mvt.js
 * Proxy serverless para las teselas MVT GeoJSON de SIGPAC HubCloud.
 *
 * El cliente no puede pedir las teselas directamente porque el navegador
 * aplica CORB (Cross-Origin Read Blocking) a las respuestas cross-origin
 * con MIME inesperado, dejando los fetches sin contenido. Este proxy hace
 * la petición server-side (sin Referer/Origin del cliente) y devuelve el
 * GeoJSON con cabeceras CORS correctas.
 *
 * Usage:
 *   GET /api/sigpac-mvt?z=16&x=32699&y=24927
 *
 * Respuestas:
 *   200 {type: "FeatureCollection", features: [...]}   tesela con recintos
 *   200 {type: "FeatureCollection", features: []}      tesela vacia (sin recintos)
 *   400 {error: "..."}                                 parametros invalidos
 *   502 {error: "..."}                                 fallo upstream
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura).
 */

const TILE_BASE = 'https://sigpac-hubcloud.es/mvt/recinto@3857@geojson'

export default async function handler(req, res) {
  const { z, x, y } = req.query

  if (z == null || x == null || y == null) {
    return res.status(400).json({ error: 'Parametros z, x, y requeridos' })
  }

  const zi = parseInt(z, 10)
  const xi = parseInt(x, 10)
  const yi = parseInt(y, 10)
  if ([zi, xi, yi].some(v => Number.isNaN(v))) {
    return res.status(400).json({ error: 'z, x, y deben ser enteros' })
  }
  // Limites razonables — evita peticiones absurdas
  if (zi < 0 || zi > 22 || xi < 0 || yi < 0) {
    return res.status(400).json({ error: 'Coordenadas fuera de rango' })
  }

  const url = `${TILE_BASE}/${zi}/${xi}/${yi}.geojson`

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 8000)

    let upstream
    try {
      upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    // Si SIGPAC devuelve 404 para una tesela, lo tratamos como tesela vacia:
    // muchas zonas (mar, montana sin recintos) carecen de datos y eso no
    // debe poblar la consola de errores del cliente.
    if (upstream.status === 404) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
      return res.status(200).json({ type: 'FeatureCollection', features: [] })
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `SIGPAC MVT respondio ${upstream.status}`,
      })
    }

    const data = await upstream.json().catch(() => null)
    if (!data) {
      return res.status(502).json({ error: 'Respuesta upstream no es JSON valido' })
    }

    // Cache agresivo: las teselas SIGPAC cambian con baja frecuencia
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({
      error:  'Error conectando con SIGPAC MVT',
      detail: err.message,
    })
  }
}
