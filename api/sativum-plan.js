/**
 * api/sativum-plan.js — :calculate-npk
 *
 * Contrato cerrado y confirmado por Miguel (1 sep 2026, ver memoria de proyecto
 * project_fertipro_mcp_visual_endpoint.md). Reglas aplicadas aquí, tal cual:
 *
 *   - Lote: { items[], pageIndex, pageSize } → { pageIndex, pageSize, count, result[] }.
 *   - Cada item de result[] lleva su propio status: 'OK'|'BLOCKED' — el 422 de lote
 *     solo salta si NINGÚN item es calculable.
 *   - tillageAfterHarvest va anidado en precedingCrop (afecta al kim del cultivo anterior).
 *   - strategy/soilType reutilizan los tokens propios de Sativum tal cual.
 *   - Agua: analítica manual por defecto en cualquier origen; el rescate ArcGIS es
 *     exclusivo de sourceType === 'SUBTERRANEA', y solo para N/K (P nunca tiene rescate).
 *     Si falta el dato y no hay rescate aplicable, nunca se pone a 0 en silencio —
 *     se emite un warning explícito.
 *   - residuesInFieldPct null = automático (regla B7 de cereal o default de catálogo).
 *   - advancedOverrides espeja algoOverrides/nEcuacion de EstrategiaPanel.jsx.
 *   - soilType/cec son SIEMPRE obligatorios, en cualquier estrategia.
 *   - Suelo P/K (pOlsen/kSoil): analítica manual por defecto; si falta, se rescata con
 *     la estimación ArcGIS (soil.arcgisPOlsen/arcgisKSoil) que ya usa normalizarSuelo()
 *     en producción — sin restricción por textura de suelo, a diferencia del rescate de
 *     agua. Son obligatorios para Sativum en CUALQUIER estrategia (OAS real:
 *     sample.required=[p_conc,k_conc], confirmado 2-sep-2026 tras un 500 real de
 *     Sativum al mandar null bajo MAINTENANCE — "MAINTENANCE ignora sample" solo es
 *     cierto para el RESULTADO, no para si el campo puede faltar en la petición). Si
 *     tampoco hay ArcGIS, se bloquea el item explícito, nunca se manda null.
 *   - organicMatter/ph SÍ los tolera ausentes MAINTENANCE (no son required en el OAS);
 *     el resto de estrategias no los tolera.
 *   - Alcance: solo N/P2O5/K2O — Ca/Mg/S/micronutrientes son del motor propio FertiPRO.
 *
 * URL definitiva (API STD), ya expuesta vía rewrite en vercel.json:
 *   POST /v1/sativum/fertilization-plans:calculate-npk
 * (el fichero sigue siendo /api/sativum-plan.js — routing por fichero de Vercel;
 * ambas rutas responden igual, la de arriba es la pública/canónica)
 *
 * Reutiliza tal cual ensamblarPayloadAlgo()/calcularNAgua() de src/api/sativum-algo.js
 * (mismas validaciones "sin rescate silencioso" ya verificadas en producción) y
 * replica el parche N-leñosos (TREES) de ese mismo fichero — no se puede reutilizar
 * su calcularNPK() porque hace fetch('/api/sativum-algo') relativo, pensado para
 * ejecutarse en el navegador, no desde otra función serverless.
 */

import { ensamblarPayloadAlgo, calcularNAgua } from '../src/api/sativum-algo.js'
import { postSativumAlgo } from '../src/api/sativum-http.js'

// Mismo criterio que App.jsx (CEC por textura, tabla real Sativum) — no es
// un rescate inventado: si no hay CEC de analítica real, se deriva de la
// textura ya resuelta (soilType), igual que hace la app en vivo. Si tampoco
// hay soilType, ensamblarPayloadAlgo() ya lanza su propio error primero.
const CEC_BY_SOIL_TYPE = {
  SANDY: 30,
  SANDY_LOAM: 75,
  LOAM: 100,
  SILTY_LOAM: 80,
  CLAY_LOAM: 220,
  CLAY: 300,
}

function errorEnvelope(httpStatus, key, message, details = []) {
  return {
    correlationId: null,
    httpStatusInfo: `${httpStatus} ${key}`,
    key,
    message,
    formattedMessage: message,
    params: {},
    details,
  }
}

async function llamarSativumAlgo(payload) {
  // Mecanismo de bajo nivel (apikey + fetch + timeout/abort) compartido con
  // api/sativum-algo.js vía src/api/sativum-http.js — ver ese fichero para
  // el porqué de no compartir más que esto (no se puede invocar el handler
  // de api/sativum-algo.js como función interna, rompería su contrato OAS).
  const { status, ok, raw } = await postSativumAlgo(payload)

  if (!ok) {
    // El upstream devuelve una página de error Django completa (HTML con
    // <style> inline antes que nada) — los primeros ~300 caracteres son solo
    // CSS, nunca el traceback real. Extraemos texto plano y, si aparece un
    // nombre de excepción tipo Python (KeyError, ValueError...), recortamos
    // una ventana centrada ahí para quedarnos con la parte útil del mensaje
    // en vez de la cabecera de estilos.
    const sinEstilos = raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    const textoPlano = sinEstilos.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    // La 1a aparición del nombre de excepcion es solo el <title>...at /ruta/</title>;
    // la 2a aparición (el <h1>) va seguida del valor real de la excepcion en la
    // pagina tecnica de Django -- por eso saltamos a la 2a, no a la 1a.
    const nombresExcepcion = [...textoPlano.matchAll(/\b[A-Z][A-Za-z]*(?:Error|Exception)\b/g)]
    const inicio = nombresExcepcion.length >= 2 ? nombresExcepcion[1].index : 0
    const detalle = textoPlano.slice(inicio, inicio + 400)
    const err = new Error(`Sativum respondió ${status}: ${detalle.slice(0, 500)}`)
    err.code = 'SATIVUM_UPSTREAM_ERROR'
    throw err
  }

  // ⚠️ Defensive parsing: upstream devuelve Content-Type: text/html aunque
  // el body sea JSON válido — igual que api/sativum-algo.js.
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    const err = new Error('Respuesta no parseable de Sativum.')
    err.code = 'SATIVUM_BAD_RESPONSE'
    throw err
  }

  if (data?.error) {
    const err = new Error(`Error upstream Sativum: ${data.error}`)
    err.code = 'SATIVUM_UPSTREAM_ERROR'
    throw err
  }

  return data
}

// Mismo parche que src/api/sativum-algo.js::calcularNPK — ver ese fichero
// para el razonamiento completo (caso Olivo, verificación con 3 leñosos
// reales, nota de mantenimiento sobre el catálogo dinámico). Duplicado
// aquí porque ese calcularNPK() hace un fetch relativo pensado para el
// navegador. Si ITACyL corrige la API pública, retirar de los dos sitios.
function aplicarParcheTrees(data, payload) {
  const efic = payload.n_equation_parameter?.efic
  if (!data?.recommendations || typeof efic !== 'number') return data
  data.recommendations = data.recommendations.map((rec, i) => {
    const features = payload.rotation[i]?.crop_features
    const esLenoso = features?.plant_species_group === 'TREES'
    const sinDatoResiduo = !features?.res_n // 0, null o undefined → true
    if (!esLenoso || !sinDatoResiduo || typeof rec?.n !== 'number') return rec
    return { ...rec, n: rec.n * (efic / 100) }
  })
  return data
}

/**
 * Resuelve el crédito de N/P/K aportado por el agua de riego para un item.
 *
 * water: { sourceType, dotacionM3, no3MgL, pMgL, kMgL, arcgisNo3MgL, arcgisKMgL }
 *   - Los 3 campos `...MgL` son la analítica MANUAL — vía por defecto en
 *     cualquier origen de agua.
 *   - `arcgisNo3MgL`/`arcgisKMgL` son el rescate por estimación ArcGIS, y
 *     SOLO se aplican si sourceType === 'SUBTERRANEA' y falta el valor
 *     manual correspondiente (no existe capa de estimación equivalente
 *     para otros orígenes). P nunca tiene rescate ArcGIS, en ningún origen.
 *   - Si con dotación > 0 sigue faltando un dato y no hay rescate aplicable,
 *     nunca se asume 0 en silencio: se emite un warning explícito y ese
 *     nutriente queda sin descuento de riego.
 */
function resolverAguaRiego(water, cultivoActual) {
  const warnings = []
  const w = water || {}

  // Dotación: si el agente no la informa, se usa la sugerida por el catálogo
  // Sativum para el cultivo actual (cultivo.irrigation) — mismo criterio que
  // App.jsx (auto-rellena dotación de riego al elegir cultivo, ver
  // useLayoutEffect correspondiente). No es un rescate inventado: es el dato
  // de catálogo, igual que la app en vivo. Si el catálogo marca secano
  // (irrigation=0 o ausente) sencillamente no hay riego que aportar.
  const dotacionInformada = w.dotacionM3 != null && w.dotacionM3 !== ''
  const dot = dotacionInformada
    ? (Number(w.dotacionM3) || 0)
    : (Number(cultivoActual?.irrigation) || 0)
  const esSubterranea = w.sourceType === 'SUBTERRANEA'

  const faltante = (v) => v == null || v === ''

  let no3 = w.no3MgL
  if (faltante(no3) && esSubterranea && !faltante(w.arcgisNo3MgL)) {
    no3 = w.arcgisNo3MgL
  }
  let k = w.kMgL
  if (faltante(k) && esSubterranea && !faltante(w.arcgisKMgL)) {
    k = w.arcgisKMgL
  }
  const p = w.pMgL // sin rescate ArcGIS en ningún origen

  if (dot > 0) {
    if (faltante(no3)) {
      warnings.push({ code: 'WATER_N_DATA_MISSING', message: 'Falta analítica de NO3 del agua de riego (y no aplica rescate ArcGIS para este origen) — no se descuenta N por riego.' })
    }
    if (faltante(k)) {
      warnings.push({ code: 'WATER_K_DATA_MISSING', message: 'Falta analítica de K del agua de riego (y no aplica rescate ArcGIS para este origen) — no se descuenta K por riego.' })
    }
    if (faltante(p)) {
      warnings.push({ code: 'WATER_P_DATA_MISSING', message: 'Falta analítica de P del agua de riego — no se descuenta P por riego (P nunca tiene rescate ArcGIS).' })
    }
  }

  const nRiego = calcularNAgua(faltante(no3) ? 0 : Number(no3), dot)
  const pRiego = faltante(p) ? 0 : (Number(p) * dot) / 1000
  const kRiego = faltante(k) ? 0 : (Number(k) * dot) / 1000

  return { nRiego, pRiego, kRiego, warnings }
}

function resolverSueloAnalitica(soil) {
  // p_conc/k_conc son SIEMPRE obligatorios para Sativum (OAS real de
  // /fertilicalc/algo/: sample.required = ["p_conc","k_conc"], sin
  // excepcion por estrategia). Aunque bajo MAINTENANCE el VALOR concreto no
  // cambie el resultado final (verificado sesion 2026-07-28), enviar null
  // revienta con un 500 real: "'>' not supported between instances of
  // 'NoneType' and 'int'" (confirmado 2-sep-2026 contra Sativum real, Patata
  // + MAINTENANCE + sample sin analitica). Igual que con el agua de riego:
  // primero la analitica manual; si falta, se rescata con la estimacion
  // ArcGIS que ya usa normalizarSuelo() en produccion (capas 6/7 de P Olsen
  // y K de suelo) -- y a diferencia del rescate de agua, este NO esta
  // restringido por tipo/textura de suelo (confirmado con Miguel
  // 2-sep-2026). Si tampoco hay dato ArcGIS, no se inventa nada: se deja
  // null y el caller (calcularItem) bloquea el item explicitamente.
  const faltante = (v) => v == null || v === ''
  let pOlsen = soil.pOlsen
  if (faltante(pOlsen) && !faltante(soil.arcgisPOlsen)) {
    pOlsen = soil.arcgisPOlsen
  }
  let kSoil = soil.kSoil
  if (faltante(kSoil) && !faltante(soil.arcgisKSoil)) {
    kSoil = soil.arcgisKSoil
  }
  return { ...soil, pOlsen, kSoil }
}

function construirCultivosArr(item) {
  const cultivos = []
  if (item.precedingCrop?.crop) {
    cultivos.push({
      cultivo: item.precedingCrop.crop,
      // Mismo criterio que App.jsx: si el agente no informa rendimiento
      // objetivo, se usa el yieldMedium del catálogo Sativum para ese
      // cultivo (dato real de catálogo, no un valor inventado desde cero).
      cropYield: item.precedingCrop.targetYield ?? item.precedingCrop.crop.yieldMedium ?? 0,
      cv: item.precedingCrop.cv ?? 0,
      recogeResiduos: Boolean(item.precedingCrop.collectResidues),
      quemaResiduos: Boolean(item.precedingCrop.burnResidues),
      fRes: item.precedingCrop.residuesInFieldPct ?? null,
    })
  }
  cultivos.push({
    cultivo: item.currentCrop.crop,
    cropYield: item.currentCrop.targetYield ?? item.currentCrop.crop.yieldMedium ?? 0,
    cv: item.currentCrop.cv ?? 0,
    recogeResiduos: Boolean(item.currentCrop.collectResidues),
    quemaResiduos: Boolean(item.currentCrop.burnResidues),
    fRes: item.currentCrop.residuesInFieldPct ?? null,
  })
  return cultivos
}

async function calcularItem(item) {
  if (!item?.currentCrop?.crop) {
    return { status: 'BLOCKED', warnings: [{ code: 'MISSING_CURRENT_CROP', message: 'Falta currentCrop.crop (cultivo actual, próxima campaña).' }] }
  }

  const strategy = item.strategy || 'MAINTENANCE'
  const soil = resolverSueloAnalitica(item.soil || {})
  const tillage = Boolean(item.precedingCrop?.tillageAfterHarvest)
  const cultivos = construirCultivosArr(item)

  // p_conc/k_conc son obligatorios para Sativum en CUALQUIER estrategia (ver
  // resolverSueloAnalitica) -- si tras el rescate ArcGIS siguen sin
  // resolver, bloqueamos aqui explicito, antes de ensamblarPayloadAlgo()
  // (que bajo MAINTENANCE dejaria pasar null sin avisar, dando pie al 500
  // real ya documentado en vez de un BLOCKED claro).
  if (soil.pOlsen == null || soil.kSoil == null) {
    const faltantes = []
    if (soil.pOlsen == null) faltantes.push('pOlsen (P de suelo)')
    if (soil.kSoil == null) faltantes.push('kSoil (K de suelo)')
    return {
      status: 'BLOCKED',
      warnings: [{
        code: 'SOIL_DATA_MISSING',
        message: `Falta ${faltantes.join(' y ')} real (ni analítica manual ni estimación ArcGIS disponible) — Sativum los exige siempre, en cualquier estrategia.`,
      }],
    }
  }

  let payload
  try {
    // Reutiliza ensamblarPayloadAlgo() tal cual — ya lanza Error si falta
    // soilType/cec (siempre obligatorios) o, fuera de MAINTENANCE, si falta
    // organicMatter/ph/pOlsen/kSoil. Aquí ese throw se traduce en BLOCKED
    // para este item, no en un fallo de todo el lote.
    payload = ensamblarPayloadAlgo(cultivos, soil, {
      strategy,
      tillage,
      cec: soil.cec ?? CEC_BY_SOIL_TYPE[soil.soilType],
      nEcuacion: item.advancedOverrides?.nEcuacion || {},
      algoOverrides: item.advancedOverrides?.algoOverrides || {},
    })
  } catch (e) {
    return { status: 'BLOCKED', warnings: [{ code: 'SOIL_DATA_MISSING', message: e.message }] }
  }

  const { nRiego, pRiego, kRiego, warnings } = resolverAguaRiego(item.water, item.currentCrop.crop)

  let data
  try {
    data = await llamarSativumAlgo(payload)
  } catch (e) {
    return { status: 'BLOCKED', warnings: [...warnings, { code: e.code || 'SATIVUM_ERROR', message: e.message }] }
  }

  data = aplicarParcheTrees(data, payload)
  const rec = data?.recommendations?.at(-1)
  if (!rec) {
    return { status: 'BLOCKED', warnings: [...warnings, { code: 'SATIVUM_NO_RECOMMENDATION', message: 'Sativum no devolvió ninguna recomendación para este item.' }] }
  }

  const nBruto = rec.n ?? 0
  const pBruto = rec.p ?? 0
  const kBruto = rec.k ?? 0

  return {
    status: 'OK',
    npk: {
      n: { gross: nBruto, waterCredit: nRiego, net: Math.max(0, nBruto - nRiego) },
      p: { gross: pBruto, waterCredit: pRiego, net: Math.max(0, pBruto - pRiego) },
      k: { gross: kBruto, waterCredit: kRiego, net: Math.max(0, kBruto - kRiego) },
    },
    warnings,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(405, 'METHOD_NOT_ALLOWED', 'Método no permitido. Usa POST.'))
  }

  const body = req.body || {}
  const items = Array.isArray(body.items) ? body.items : null
  if (!items) {
    return res.status(400).json(errorEnvelope(400, 'INVALID_BODY', 'El body debe incluir items[] (array de unidades a calcular).'))
  }

  const pageSize = Math.min(Math.max(Number(body.pageSize) || 20, 1), 100)
  const pageIndex = Math.max(Number(body.pageIndex) || 0, 0)
  const pageItems = items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

  const result = []
  for (const item of pageItems) {
    let r
    try {
      r = await calcularItem(item)
    } catch (e) {
      r = { status: 'BLOCKED', warnings: [{ code: 'UNEXPECTED_ERROR', message: e.message }] }
    }
    result.push(r)
  }

  // 422 de lote (§10 API STD) solo si NINGÚN item de la página es calculable.
  // Con al menos uno OK, se devuelve 200 y cada item lleva su propio status.
  if (result.length > 0 && !result.some((r) => r.status === 'OK')) {
    return res.status(422).json(errorEnvelope(422, 'NO_ITEM_CALCULABLE', 'Ningún elemento de este lote es calculable.', result))
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    pageIndex,
    pageSize,
    count: items.length,
    result,
  })
}
