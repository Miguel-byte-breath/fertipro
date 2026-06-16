/**
 * src/api/sativum-suelo.js — wrapper cliente de la API Sativum (ITACyL).
 *
 * Llama al proxy serverless `/api/sativum-suelo` (que añade la apikey upstream).
 *
 * El upstream es un MapServer ArcGIS REST cuya operación `identify` devuelve
 * un objeto `{ results: [{ layerId, layerName, value, attributes, ... }, ...] }`
 * — un resultado por cada capa del servicio que intersecta el punto.
 *
 * Capas del MapServer Sativum:
 *   0 → Materia orgánica (%)
 *   1 → Textura simplificada  (Pixel Value 101-106)
 *   2 → Clasificación textural USDA (Pixel Value 1-12)
 *   3 → Capacidad de campo
 *   4 → Capacidad de retención de agua
 *   5 → pH
 *   6 → P Olsen (ppm)
 *   7 → K (ppm)
 *   8 → K agua de riego (mg/L)
 *   9 → NO₃ agua de riego (mg/L)
 */

import soilTypesSimpl from '../data/sativum/soilTypesSimpl.json'
import soilTypes      from '../data/sativum/soilTypes.json'

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

/**
 * Convierte la respuesta cruda de ArcGIS en un objeto normalizado
 * listo para usar en ensamblarPayloadAlgo().
 *
 * Resuelve la cadena:
 *   Pixel Value capa 1 (101-106) → soilTypesSimpl → descNutrients (SANDY/LOAM/…)
 *
 * @param {object} arcgisData — respuesta de identifySativum()
 * @returns {object} suelo normalizado:
 *   {
 *     soilType,        — enum SANDY|SANDY_LOAM|LOAM|SILTY_LOAM|CLAY_LOAM|CLAY
 *     soilTypePixel,   — valor raw capa 1 (101-106)
 *     organicMatter,   — MO (%)
 *     ph,
 *     pOlsen,          — P Olsen (ppm)
 *     kSoil,           — K suelo (ppm)
 *     kIrrigation,     — K agua de riego (mg/L)
 *     no3Irrigation,   — NO₃ agua de riego (mg/L)
 *   }
 *   Devuelve null si arcgisData es null o no tiene results.
 */
export function normalizarSuelo(arcgisData) {
  if (!arcgisData?.results?.length) return null

  // Indexar por layerId para acceso O(1)
  const byLayer = {}
  for (const r of arcgisData.results) {
    byLayer[r.layerId] = parseFloat(r.attributes?.['Pixel Value'] ?? NaN)
  }

  // Resolver tipo de suelo desde capa 1 (Textura simplificada, valores 101-106)
  const soilTypePixel = byLayer[1]
  const soilTypeEntry = soilTypesSimpl.find(s => s.value === soilTypePixel)
  const soilType      = soilTypeEntry?.descNutrients ?? 'LOAM'  // fallback seguro

  // Textura USDA oficial desde capa 2 (clasificación 12 clases, valores 1-12)
  const soilTypeUsdaPixel = byLayer[2]
  const soilTypeUsdaEntry = soilTypes.find(s => s.value === soilTypeUsdaPixel)
  const soilTypeUsdaLabel = soilTypeUsdaEntry?.description ?? null

  return {
    soilType,
    soilTypePixel,
    soilTypeUsdaPixel,
    soilTypeUsdaLabel,
    organicMatter: isNaN(byLayer[0]) ? null : byLayer[0],
    ph:            isNaN(byLayer[5]) ? null : byLayer[5],
    pOlsen:        isNaN(byLayer[6]) ? null : byLayer[6],
    kSoil:         isNaN(byLayer[7]) ? null : byLayer[7],
    kIrrigation:   isNaN(byLayer[8]) ? null : byLayer[8],
    no3Irrigation: isNaN(byLayer[9]) ? null : byLayer[9],
  }
}
