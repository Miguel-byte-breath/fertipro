/**
 * src/api/sativum-fertilizers.js — wrapper cliente fertilizantes Sativum
 *
 * Cubre tres operaciones:
 *   1. Lista de fertilizantes (con filtros opcionales)
 *   2. Detalle de un fertilizante por ID
 *   3. Recomendación de combinaciones dado un objetivo NPK
 *
 * Conversiones de unidades:
 *   El motor /algo/ devuelve P y K en elemento puro (kg P/ha, kg K/ha).
 *   La recomendación espera P₂O₅ y K₂O (UF estándar sector).
 *   La conversión se hace aquí, en el cliente, antes de llamar al proxy.
 *     P  → P₂O₅ : × 2.2914
 *     K  → K₂O  : × 1.2046
 */

// ─── Conversión de unidades ───────────────────────────────────────────────────

export const P_TO_P2O5 = 2.2914
export const K_TO_K2O  = 1.2046

/** kg P/ha (elemento puro) → kg P₂O₅/ha */
export const pToOxide = p => p * P_TO_P2O5

/** kg K/ha (elemento puro) → kg K₂O/ha */
export const kToOxide = k => k * K_TO_K2O

// ─── Helper ID ────────────────────────────────────────────────────────────────

/**
 * Parsea el ID real de un fertilizante desde links[0].href.
 * En la respuesta de /recommendation todos los productos tienen id=0;
 * el ID real está en el último segmento de la URL HATEOAS.
 *
 * @param {object} producto  — item de la respuesta de Sativum
 * @returns {string|null}
 *
 * @example
 *   extractFertilizerId({ links: [{ href: '.../fertilizers/742' }] }) // '742'
 */
export function extractFertilizerId(producto) {
  const href = producto?.links?.[0]?.href
  if (!href) return null
  const parts = href.split('/')
  return parts[parts.length - 1] || null
}

// ─── Lista ────────────────────────────────────────────────────────────────────

/**
 * Obtiene la lista de fertilizantes del catálogo Sativum.
 *
 * @param {object} [opts]
 * @param {string} [opts.name]  — filtro por nombre (aplicado en el servidor)
 * @returns {Promise<object[]>}
 */
export async function getFertilizadores(opts = {}) {
  const params = new URLSearchParams()
  if (opts.name) params.set('name', opts.name)

  const qs  = params.toString()
  const url = `/api/sativum-fertilizers${qs ? `?${qs}` : ''}`

  try {
    const res  = await fetch(url)
    const data = await res.json().catch(() => [])
    if (!res.ok) {
      if (res.status === 503 && data?.stub) return []
      throw new Error(data?.error || `sativum-fertilizers ${res.status}`)
    }
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('[sativum-fertilizers/lista]', err.message)
    return []
  }
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el detalle de un fertilizante por ID.
 * Nota: el detalle usa ca/mg/s/na (distinto de la lista que usa cao/mgo/so3/na2o).
 *
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
export async function getFertilizador(id) {
  try {
    const res  = await fetch(`/api/sativum-fertilizers?id=${encodeURIComponent(id)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || `sativum-fertilizers/${id} ${res.status}`)
    return data
  } catch (err) {
    console.warn('[sativum-fertilizers/detalle]', err.message)
    return null
  }
}

// ─── Recomendación ────────────────────────────────────────────────────────────

/**
 * Solicita una propuesta de combinación de fertilizantes a Sativum.
 *
 * Recibe el resultado crudo de /algo/ (N, P, K en elemento puro) y convierte
 * P → P₂O₅ y K → K₂O antes de llamar al proxy.
 *
 * @param {object} npkAlgo          — { n, p, k } en elemento puro (kg/ha)
 * @param {object} [opts]
 * @param {object} [opts.npkTotal]  — NPK total si parte ya está cubierta
 *                                    (mismas unidades: N, P elemento, K elemento)
 * @param {object[]} [opts.fertilizers] — stock propio del agricultor
 * @param {string}  [opts.adjustedNutrient='N'] — N|P|K
 * @returns {Promise<object|null>}
 *   { recommendations: [{ fertilizers, totalApplied, ... }], observations }
 *   null si falla
 */
export async function getRecomendacion(npkAlgo, opts = {}) {
  const { npkTotal, fertilizers, adjustedNutrient = 'N' } = opts

  const body = {
    adjustedNutrient,
    npkToCover: {
      n: npkAlgo.n,
      p: pToOxide(npkAlgo.p),
      k: kToOxide(npkAlgo.k),
    },
    ...(npkTotal ? {
      npkTotal: {
        n: npkTotal.n,
        p: pToOxide(npkTotal.p),
        k: kToOxide(npkTotal.k),
      },
    } : {}),
    ...(fertilizers?.length ? { fertilizers } : {}),
  }

  try {
    const res  = await fetch('/api/sativum-fertilizers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 503 && data?.stub) return null
      throw new Error(data?.error || `sativum-fertilizers/recommendation ${res.status}`)
    }
    return data
  } catch (err) {
    console.warn('[sativum-fertilizers/recomendacion]', err.message)
    return null
  }
}
