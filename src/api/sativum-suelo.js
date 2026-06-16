/**
 * src/api/sativum-suelo.js — wrapper cliente de la API Sativum (ITACyL).
 *
 * Llama al proxy serverless `/api/sativum-suelo` (que añade la apikey upstream).
 *
 * El upstream es un MapServer ArcGIS REST cuya operación `identify` devuelve
 * un objeto `{ results: [{ layerId, layerName, value, attributes, ... }, ...] }`
 * — un resultado por cada capa del servicio que intersecta el punto.
 *
 * Este wrapper devuelve la respuesta cruda de ArcGIS. La normalización por
 * capa (suelos, clima, …) se hará cuando confirmemos qué capas expone el
 * MapServer y qué atributos nos interesan para el motor de cálculo FertiPRO.
 */

/**
 * Identify Sativum en un punto lon/lat.
 *
 * @param {number} lon
 * @param {number} lat
 * @param {object} [opts]
 * @param {string} [opts.layers='all']   ej. 'all' | 'visible:0,2,5'
 * @param {number} [opts.tolerance=10]
 * @returns {Promise<{ results: object[] } | null>}
 *          - `null` si Sativum no está configurado (stub) — degradación elegante
 */
export async function identifySativum(lon, lat, opts = {}) {
  const params = new URLSearchParams({
    lon:       String(lon),
    lat:       String(lat),
    layers:    opts.layers ?? 'all',
    tolerance: String(opts.tolerance ?? 10),
  })

  try {
    const res  = await fetch(`/api/sativum-suelo?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 503 stub: aún no configurado → degradación elegante, no rompemos la UI
      if (res.status === 503 && data?.stub) return null
      throw new Error(data.error || `Sativum ${res.status}`)
    }
    return data
  } catch (err) {
    console.warn('[sativum]', err.message)
    return null
  }
}

/**
 * Filtra los resultados de identify por nombre de capa (case-insensitive).
 * Útil para extraer una capa concreta sin repetir el fetch.
 *
 * @example
 *   const data = await identifySativum(lon, lat)
 *   const suelos = filtrarCapa(data, 'suelo')
 */
export function filtrarCapa(data, nombrePatron) {
  if (!data?.results?.length) return []
  const re = new RegExp(nombrePatron, 'i')
  return data.results.filter(r => re.test(r.layerName ?? ''))
}
