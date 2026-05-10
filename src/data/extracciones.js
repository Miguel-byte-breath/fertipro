/**
 * src/data/extracciones.js
 *
 * Acceso al JSON de extracciones (`public/data/extracciones_fertipro.json`).
 *
 * Estructura del JSON:
 * {
 *   meta: { version, fecha_export, fuente, total_registros, categorias[] },
 *   cultivos: [{
 *     nombre, categoria, familia_botanica, n_fijado,
 *     auditoria:        { fecha_alta, fecha_modificacion, fecha_baja },
 *     params:           { ms_pct, hi_pct, residuos_pct, beta, ef, efr },
 *     parte_comercial:     { organo, nutrientes_pct: { N, P, K, Ca, Mg, S, Fe, Cu, Mn, Zn, B, Mo } },
 *     parte_no_comercial:  { organo, nutrientes_pct: { ... } } | null
 *   }, ...]
 * }
 *
 * Convenciones:
 *   - `null` significa "no determinado" (nd) — distinto de 0.
 *   - `n_fijado: true` → leguminosa o fabácea fijadora de nitrógeno.
 *   - `params.beta` y `params.ef` solo están poblados en frutales (32 registros).
 *
 * Caché: el JSON se descarga una sola vez por sesión (≈ 180 KB).
 */

const JSON_URL = '/data/extracciones_fertipro.json'

let _cache    = null
let _inflight = null

/**
 * Carga el JSON completo (meta + cultivos). Cacheado en memoria.
 * @returns {Promise<{meta: object, cultivos: object[]}>}
 */
export async function loadExtracciones() {
  if (_cache) return _cache
  if (_inflight) return _inflight

  _inflight = fetch(JSON_URL)
    .then(res => {
      if (!res.ok) throw new Error(`No se pudo cargar ${JSON_URL}: ${res.status}`)
      return res.json()
    })
    .then(data => {
      if (!Array.isArray(data?.cultivos)) {
        throw new Error('Estructura inválida en extracciones_fertipro.json')
      }
      _cache    = data
      _inflight = null
      return data
    })
    .catch(err => {
      _inflight = null
      throw err
    })

  return _inflight
}

/**
 * Lista plana de cultivos (sin meta).
 * @returns {Promise<object[]>}
 */
export async function listarCultivos() {
  const { cultivos } = await loadExtracciones()
  return cultivos
}

/**
 * Cultivos agrupados por categoría, en el orden de meta.categorias.
 * @returns {Promise<{categoria: string, cultivos: object[]}[]>}
 */
export async function listarCultivosPorCategoria() {
  const { meta, cultivos } = await loadExtracciones()
  const orden = meta?.categorias ?? [...new Set(cultivos.map(c => c.categoria))]
  const map   = new Map(orden.map(cat => [cat, []]))
  cultivos.forEach(c => {
    if (!map.has(c.categoria)) map.set(c.categoria, [])
    map.get(c.categoria).push(c)
  })
  return [...map.entries()].map(([categoria, lista]) => ({
    categoria,
    cultivos: lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }))
}

/**
 * Busca un cultivo por nombre exacto (sensible a tildes).
 * @param {string} nombre
 * @returns {Promise<object|null>}
 */
export async function getCultivoPorNombre(nombre) {
  const cultivos = await listarCultivos()
  return cultivos.find(c => c.nombre === nombre) ?? null
}
