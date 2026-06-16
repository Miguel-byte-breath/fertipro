/**
 * src/api/sativum-crops.js — wrapper cliente del catálogo de cultivos Sativum.
 *
 * Llama al proxy serverless `/api/sativum-crops`.
 *
 * Cada cultivo incluye los parámetros agronómicos que necesita el motor
 * FertiliCalc: HI, concentraciones N/P/K en órganos cosechados, f_res,
 * nfix_code, plantSpeciesGroup, yieldLow/Medium/High, etc.
 */

/**
 * Obtiene el catálogo de cultivos de Sativum.
 *
 * @param {object} [opts]
 * @param {string} [opts.name]   filtro por nombre (ej. 'Cebada')
 * @param {string} [opts.group]  filtro por grupo (ej. 'Cereals')
 * @returns {Promise<object[]>}  array de cultivos, [] si falla
 */
export async function getCultivos(opts = {}) {
  const params = new URLSearchParams()
  if (opts.name)  params.set('name',  opts.name)
  if (opts.group) params.set('group', opts.group)

  const qs  = params.toString()
  const url = `/api/sativum-crops${qs ? `?${qs}` : ''}`

  try {
    const res  = await fetch(url)
    const data = await res.json().catch(() => [])
    if (!res.ok) {
      if (res.status === 503 && data?.stub) return []
      throw new Error(data.error || `sativum-crops ${res.status}`)
    }
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('[sativum-crops]', err.message)
    return []
  }
}

/**
 * Agrupa un array de cultivos por plantSpeciesGroup.
 *
 * @param {object[]} cultivos
 * @returns {Map<string, object[]>}  clave = grupo, valor = array de cultivos
 */
export function agruparPorGrupo(cultivos) {
  return cultivos.reduce((map, c) => {
    const grupo = c.plantSpeciesGroup ?? 'Sin grupo'
    if (!map.has(grupo)) map.set(grupo, [])
    map.get(grupo).push(c)
    return map
  }, new Map())
}

/**
 * Detecta la anomalía conocida de Sativum: yieldMedium < yieldLow.
 * Devuelve true si el cultivo tiene datos de rendimiento inconsistentes.
 *
 * @param {object} cultivo
 * @returns {boolean}
 */
export function tieneRendimientoAnomalo(cultivo) {
  const { yieldLow, yieldMedium } = cultivo
  if (yieldLow == null || yieldMedium == null) return false
  return yieldMedium < yieldLow
}
