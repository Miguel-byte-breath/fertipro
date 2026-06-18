/**
 * src/utils/recintosInterseccion.js
 *
 * Dado un Feature de parcela (Polygon o MultiPolygon en EPSG:4326), devuelve
 * la lista de recintos SIGPAC que intersectan la geometría con:
 *
 *   - referencia catastral completa (provincia/municipio/poligono/parcela/recinto)
 *   - uso SIGPAC, pendiente media, altitud
 *   - superficie total del recinto en hectáreas
 *   - superficie de la intersección en hectáreas
 *   - porcentaje del recinto ocupado por la parcela
 *   - observación: "Completo" (≥99.5 %) o "Recortado" (<99.5 %)
 *
 * Auto-detecta el origen de la parcela:
 *
 *   Caso A — `properties.recintos_origen` poblado y geometría coincide
 *            (hoja construida desde recintos SIGPAC, sin edición posterior):
 *            cada recinto está al 100 %, no se llama al servicio.
 *
 *   Caso B — el resto (dibujada, cargada, o SIGPAC modificada con edición/tijera):
 *            bbox del feature → /api/sigpac-bbox → turf.intersect contra cada
 *            recinto devuelto → quedan los que realmente cruzan.
 *
 * El umbral de discrepancia (caso A → caso B) es 1 % sobre la superficie
 * declarada por SIGPAC. Si el usuario edita un vértice o corta con tijera,
 * la superficie cambia y caemos a la rama B para recalcular correctamente.
 */
import area    from '@turf/area'
import bbox    from '@turf/bbox'
import intersect from '@turf/intersect'
import { featureCollection } from '@turf/helpers'

// El endpoint /api/sigpac-bbox capa internamente el bbox a 0.05° (~5 km²).
// Dejamos un margen para no rozar el límite por errores de redondeo.
const MAX_BBOX_DELTA = 0.045

// Umbral relativo: si la superficie actual difiere menos de esto respecto a
// la suma de los recintos origen, consideramos que la hoja sigue intacta.
const DISC_THRESHOLD = 0.01

/**
 * Devuelve la categoría de la parcela según su origen y estado actual:
 *   'SIGPAC'            — construida desde recintos SIGPAC, sin edición.
 *   'SIGPAC modificada' — construida desde SIGPAC pero editada/recortada.
 *   'Libre'             — dibujada o cargada (sin recintos_origen).
 */
export function detectarTipoParcela(feature) {
  const origen = feature?.properties?.recintos_origen
  if (!Array.isArray(origen) || origen.length === 0) return 'Libre'

  const sumOriginal = origen.reduce(
    (s, r) => s + (Number(r.superficie_ha) || 0),
    0
  )
  if (sumOriginal <= 0) return 'SIGPAC modificada'

  const supActual = area(feature) / 10000
  const disc = Math.abs(supActual - sumOriginal) / sumOriginal
  return disc <= DISC_THRESHOLD ? 'SIGPAC' : 'SIGPAC modificada'
}

/**
 * ¿El usuario ha modificado activamente la geometría? Se da por cierto si:
 *   - El feature está marcado con `editada_por_usuario` (lo pone MapPicker
 *     cuando se dispara pm:edit o pm:cut, sea cual sea el origen).
 *   - O el tipo es 'SIGPAC modificada' (construida desde SIGPAC + edición).
 *
 * Sirve para distinguir "Recortado" (acción explícita) de "Parcial" (la
 * parcela dibujada libre simplemente no coincide con los bordes catastrales).
 */
function parcelaEditada(feature) {
  if (feature?.properties?.editada_por_usuario === true) return true
  return detectarTipoParcela(feature) === 'SIGPAC modificada'
}

/**
 * Calcula la lista de recintos SIGPAC que intersecta la parcela.
 *
 * @param {GeoJSON.Feature} feature   Feature Polygon/MultiPolygon (EPSG:4326).
 * @returns {Promise<Array<{
 *   provincia: number, municipio: number, poligono: number,
 *   parcela: number, recinto: number,
 *   uso_sigpac: string|null,
 *   pendiente_media: number|null, altitud: number|null,
 *   superficie_total_ha: number, superficie_interseccion_ha: number,
 *   pct_ocupado: number, observacion: 'Completo'|'Recortado',
 * }>>}
 */
export async function interseccionRecintos(feature) {
  if (!feature?.geometry) return []

  const tipo = detectarTipoParcela(feature)

  // Caso A: SIGPAC intacta → cada recinto al 100 %, no se llama al servicio.
  if (tipo === 'SIGPAC') {
    const origen = feature.properties.recintos_origen
    const base = origen.map(r => ({
      provincia: r.provincia,
      municipio: r.municipio,
      poligono:  r.poligono,
      parcela:   r.parcela,
      recinto:   r.recinto,
      uso_sigpac:      r.uso_sigpac ?? null,
      coef_regadio:    r.coef_regadio ?? null,
      pendiente_media: r.pendiente_media != null ? Number(r.pendiente_media) : null,
      altitud:         r.altitud != null ? Number(r.altitud) : null,
      superficie_total_ha:        Number(r.superficie_ha) || 0,
      superficie_interseccion_ha: Number(r.superficie_ha) || 0,
      pct_ocupado:                100,
      observacion:                'Completo',
    }))
    return await _enrichConRecinfo(base)
  }

  // Caso B: hay que consultar SIGPAC y recortar al polígono real.
  // Pasamos `editada` (acción explícita del usuario: tijera/edición o SIGPAC
  // tras edición) para distinguir "Recortado" de "Parcial".
  return await _interseccionDesdeBbox(feature, parcelaEditada(feature))
}

async function _interseccionDesdeBbox(feature, editada) {
  const [minX, minY, maxX, maxY] = bbox(feature)

  if ((maxX - minX) > MAX_BBOX_DELTA || (maxY - minY) > MAX_BBOX_DELTA) {
    const kmX = (maxX - minX) * 111
    const kmY = (maxY - minY) * 111
    throw new Error(
      `La parcela es demasiado grande (${kmX.toFixed(1)} × ${kmY.toFixed(1)} km).\n` +
      `El servicio SIGPAC limita la consulta a unos 5 km². Divide la parcela ` +
      `o consulta los recintos por zonas más pequeñas.`
    )
  }

  const url =
    `/api/sigpac-bbox?west=${minX}&south=${minY}&east=${maxX}&north=${maxY}`

  let data
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `SIGPAC bbox ${res.status}`)
    }
    data = await res.json()
  } catch (err) {
    throw new Error(`No se pudo consultar SIGPAC: ${err.message}`)
  }

  if (!data?.features?.length) return []

  const resultado = []
  for (const rec of data.features) {
    try {
      const inter = intersect(featureCollection([feature, rec]))
      if (!inter) continue

      const supInter = area(inter) / 10000
      if (supInter <= 0) continue

      const props    = rec.properties || {}
      const supDecl  = props.superficie_ha != null ? Number(props.superficie_ha) : null
      const supTotal = supDecl != null && !isNaN(supDecl) ? supDecl : (area(rec) / 10000)

      const pct = supTotal > 0 ? (supInter / supTotal) * 100 : 0

      // Etiqueta semántica:
      //   "Completo"  si la intersección ≥ 99,5 % del recinto.
      //   "Recortado" si el usuario ha modificado la parcela (tijera o edición).
      //   "Parcial"   si la parcela libre simplemente intersecta una porción
      //               del recinto sin que el usuario haya intervenido.
      const observacion = pct >= 99.5
        ? 'Completo'
        : editada
          ? 'Recortado'
          : 'Parcial'

      resultado.push({
        provincia: Number(props.provincia),
        municipio: Number(props.municipio),
        poligono:  Number(props.poligono),
        parcela:   Number(props.parcela),
        recinto:   Number(props.recinto),
        uso_sigpac:      props.uso_sigpac ?? props.uso ?? props.cod_uso ?? null,
        coef_regadio:    null,  // se rellena en _enrichConRecinfo
        pendiente_media: props.pendiente_media != null ? Number(props.pendiente_media) : null,
        altitud:         props.altitud != null ? Number(props.altitud) : null,
        superficie_total_ha:        supTotal,
        superficie_interseccion_ha: supInter,
        pct_ocupado:                pct,
        observacion,
      })
    } catch (err) {
      // Geometría inválida o auto-intersectada — log y seguimos
      // eslint-disable-next-line no-console
      console.warn('[interseccionRecintos] recinto omitido:', err.message)
    }
  }

  // Ordenar por superficie de intersección descendente (los más relevantes primero)
  resultado.sort((a, b) => b.superficie_interseccion_ha - a.superficie_interseccion_ha)
  return await _enrichConRecinfo(resultado)
}

/**
 * Enriquece una lista de recintos con uso_sigpac y coef_regadio desde
 * el servicio REST SIGPAC (/api/sigpac-recinfo). Las llamadas se hacen
 * en paralelo; si alguna falla, el recinto se devuelve sin modificar.
 */
async function _enrichConRecinfo(recintos) {
  const results = await Promise.allSettled(
    recintos.map(async r => {
      try {
        const url = `/api/sigpac-recinfo?pr=${r.provincia}&mu=${r.municipio}&po=${r.poligono}&pa=${r.parcela}&re=${r.recinto}`
        const res = await fetch(url)
        if (!res.ok) return r
        const data = await res.json()
        return {
          ...r,
          uso_sigpac:   r.uso_sigpac   ?? data.uso_sigpac   ?? null,
          coef_regadio: data.coef_regadio ?? null,
        }
      } catch {
        return r
      }
    })
  )
  return results.map((e, i) => e.status === 'fulfilled' ? e.value : recintos[i])
}
