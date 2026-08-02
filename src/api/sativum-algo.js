/**
 * src/api/sativum-algo.js — wrapper cliente para el cálculo NPK (FertiliCalc)
 *
 * Ensambla el payload completo de POST /fertilicalc/algo/ a partir de:
 *   - cultivo(s) del catálogo Sativum (/nutrients/crops)
 *   - datos de suelo normalizados (normalizarSuelo → ArcGIS)
 *   - parámetros de estrategia + tabla algoParams
 *   - opciones de usuario (rendimiento, laboreo, residuos, agua de riego)
 */

import { getAlgoParams, N_EQUATION_DEFAULTS, MAX_P_RATE, MAX_K_RATE } from '../data/sativum/algoParams.js'

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Factor conversión NO₃ mg/L → kg N/ha por m³/ha de dotación */
const NO3_TO_N = 14 / 62  // 0.2258

// ─── Mapper cultivo ───────────────────────────────────────────────────────────

/**
 * Convierte un cultivo del catálogo Sativum al formato crop_features del API.
 *
 * Conversiones necesarias:
 *   - plantSpeciesGroup → plant_species_group (toUpperCase)
 *   - nfixCode (0/1)   → nfix_code (boolean)
 *   - camelCase        → snake_case
 *   - fres override    → si Cereales y usuario no recoge paja → f_res = 100
 *
 * @param {object} cultivo   — objeto del catálogo /nutrients/crops
 * @param {object} [opts]
 * @param {boolean} [opts.recogeResiduos]  — ¿recoge residuos? (false = deja en campo)
 * @param {boolean} [opts.quemaResiduos]   — ¿quema residuos?
 * @param {number|null} [opts.fResOverride] — override manual del usuario (null = auto B7)
 * @returns {object} crop_features listo para el payload
 */
function cultivoToCropFeatures(cultivo, opts = {}) {
  const { recogeResiduos = false, quemaResiduos = false, fResOverride = null } = opts

  // f_res: override manual del usuario prevalece; si no, regla B7 para cereales
  let fRes
  if (fResOverride !== null && fResOverride !== undefined) {
    fRes = fResOverride
  } else {
    fRes = cultivo.fres ?? 100
    // Regla B7: Cereales con fres=10 y no recoge paja → f_res=100
    if (
      cultivo.plantSpeciesGroup?.toUpperCase() === 'CEREALS' &&
      cultivo.fres === 10 &&
      !recogeResiduos
    ) {
      fRes = 100
    }
  }

  return {
    plant_species_group: cultivo.plantSpeciesGroup?.toUpperCase() ?? 'OTHER',
    harvest_product:     cultivo.harvestProduct ?? 'biomass',
    dry_matter:          cultivo.dryMatter,
    n:                   cultivo.n,
    p:                   cultivo.p,
    k:                   cultivo.k,
    res_product:         cultivo.resProduct   ?? 'none',
    res_dry_matter:      cultivo.resDryMatter ?? 0,
    res_n:               cultivo.resN         ?? 0,
    res_p:               cultivo.resP         ?? 0,
    res_k:               cultivo.resK         ?? 0,
    nfix_code:           Boolean(cultivo.nfixCode),
    n_min:               cultivo.nMin         ?? null,
    n_max:               cultivo.nMax         ?? null,
    hi:                  cultivo.hi,
    f_res:               fRes,
    ca:                  cultivo.ca           ?? null,
    s:                   cultivo.s            ?? null,
    mg:                  cultivo.mg           ?? null,
    res_ca:              cultivo.resCa        ?? null,
    res_s:               cultivo.resS         ?? null,
    res_mg:              cultivo.resMg        ?? null,
  }
}

// ─── Cálculo N del agua de riego ──────────────────────────────────────────────

/**
 * Calcula el N aportado por el agua de riego (kg N/ha).
 *
 * @param {number} no3MgL      — concentración NO₃ en mg/L
 * @param {number} dotacionM3  — dotación de riego en m³/ha
 * @returns {number} kg N/ha
 */
export function calcularNAgua(no3MgL, dotacionM3) {
  if (!no3MgL || !dotacionM3) return 0
  return no3MgL * dotacionM3 * 0.001 * NO3_TO_N
}

// ─── Ensamblador principal ────────────────────────────────────────────────────

/**
 * Ensambla el payload completo para POST /fertilicalc/algo/.
 *
 * @param {object[]} cultivos   — array de { cultivo, cropYield, cv, recogeResiduos, quemaResiduos, fRes }
 * @param {object}   suelo      — resultado de normalizarSuelo()
 * @param {object}   opts
 * @param {string}   opts.strategy          — SUFFICIENCY|REDUCED|MAINTENANCE|MAXIMUM
 * @param {boolean}  [opts.tillage=false]   — ¿laboreo?
 * @param {number}   opts.cec               — CEC (meq/kg); obligatorio, sin default (ver más abajo)
 * @param {object}   [opts.riego]           — ya no se usa aquí (ver nota junto a n_other más abajo);
 *                                            se ignora si el caller lo sigue pasando
 * @param {object}   [opts.nEcuacion]       — overrides avanzados de n_equation_parameter
 * @throws {Error} si `suelo.soilType` o `opts.cec` no son valores reales — este ensamblador
 *   nunca inventa un soil_type/CEC de rescate para el payload real de Sativum (confirmado con
 *   Miguel 2026-08-02). El caller (App.jsx, handleCalcularNecesidades) ya bloquea el cálculo
 *   client-side con un aviso claro antes de llegar aquí si el usuario no ha resuelto un origen
 *   real de suelo (ni ArcGIS ni "Análisis de suelo propio") — este throw es solo defensa en
 *   profundidad, para que ningún caller futuro pueda reintroducir un rescate en silencio.
 * @returns {object} payload listo para enviar al proxy /api/sativum-algo
 */
export function ensamblarPayloadAlgo(cultivos, suelo, opts = {}) {
  const {
    strategy      = 'MAINTENANCE',
    tillage       = false,
    cec,
    nEcuacion     = {},
    algoOverrides = {},   // overrides opcionales de los ajustes del algoritmo
  } = opts

  const soilType = suelo.soilType
  if (!soilType) {
    throw new Error('ensamblarPayloadAlgo: falta suelo.soilType real (sin rescate a "LOAM") — el caller debe resolver un origen de suelo antes de llamar.')
  }
  if (cec == null) {
    throw new Error('ensamblarPayloadAlgo: falta opts.cec real (sin rescate a 220) — el caller debe resolver un CEC antes de llamar.')
  }
  // som/ph/p_conc/k_conc (el `sample` real) solo son obligatorios fuera de
  // MAINTENANCE -- verificado empíricamente (sesión 2026-07-28, caso OCEAN
  // ALMOND) que el servidor de ITACyL ignora `sample` por completo bajo esa
  // estrategia (3 payloads con mismo soil_type/efficiency_factor pero sample
  // distinto dieron resultado idéntico byte a byte), así que null ahí es
  // inofensivo, no un rescate. Bajo el resto de estrategias, `sample` sí se
  // usa -- si algún caller llegara aquí sin haberlo resuelto (el guard real
  // vive en App.jsx, esto es defensa en profundidad), se prefiere fallar
  // explícito antes que mandar null y arriesgar el 500 ya documentado.
  if (strategy !== 'MAINTENANCE') {
    const faltantes = []
    if (suelo.organicMatter == null) faltantes.push('organicMatter (MO)')
    if (suelo.ph == null)            faltantes.push('ph')
    if (suelo.pOlsen == null)        faltantes.push('pOlsen (P)')
    if (suelo.kSoil == null)         faltantes.push('kSoil (K)')
    if (faltantes.length) {
      throw new Error(`ensamblarPayloadAlgo: falta ${faltantes.join(', ')} real para la estrategia ${strategy} (sin rescate) — el caller debe resolver un análisis de suelo real antes de llamar.`)
    }
  }
  const params   = getAlgoParams(strategy, soilType)

  // n_other = solo deposición atmosférica (10). El agua de riego NO se mete
  // aquí: la necesidad bruta del cultivo (n devuelto por /algo/) es la misma
  // haya riego o no — es agronómicamente independiente del origen del agua.
  // Si se sumara nAgua aquí (como se hacía antes), con aportes de agua altos
  // (p.ej. NO₃ de origen subterráneo) la ecuación puede quedar negativa y la
  // API recorta el resultado a 0, perdiendo el dato de la necesidad real.
  // El descuento del agua de riego se aplica después, client-side, sobre el
  // N bruto ya devuelto (ver App.jsx: npkParaRec.n = max(0, n - nRiego)),
  // igual que ya se hace con P y K. Confirmado con Miguel (2026-07-10) tras
  // detectar el caso real: origen subterráneo con NO₃ alto → n_other tan
  // grande que /algo/ devolvía n=0 en vez del bruto esperado (190.3).
  const nOther = N_EQUATION_DEFAULTS.n_other

  const rotation = cultivos.map(({ cultivo, cropYield, cv = 0, recogeResiduos = false, quemaResiduos = false, fRes = null }) => ({
    crop_yield:       cropYield,
    cv:               cv,
    collect_residues: recogeResiduos,
    burn_residues:    quemaResiduos,
    crop_features:    cultivoToCropFeatures(cultivo, { recogeResiduos, quemaResiduos, fResOverride: fRes }),
  }))

  console.debug('[algo payload] rotation:', JSON.stringify(rotation))
  console.debug('[algo payload] n_equation_parameter:', { ...N_EQUATION_DEFAULTS, n_other: nOther, ...nEcuacion })

  return {
    rotation,
    soil: {
      soil_type: soilType,
    },
    sample: {
      // Sin rescate a 2% -- si organicMatter no está resuelto (ni ArcGIS ni
      // análisis propio), o falta ph/pOlsen/kSoil, la validación de arriba ya
      // ha bloqueado la llamada para toda estrategia != MAINTENANCE. Bajo
      // MAINTENANCE el null viaja tal cual (confirmado inofensivo).
      som:    suelo.organicMatter ?? null,
      ph:     suelo.ph           ?? null,
      p_conc: suelo.pOlsen       ?? null,
      k_conc: suelo.kSoil        ?? null,
      cec,
    },
    p_threshold:       { value:  algoOverrides.pThreshold       ?? params.p_threshold },
    k_threshold:       { value:  algoOverrides.kThreshold       ?? params.k_threshold },
    soil_effect:       { coeff:  algoOverrides.soilEffect        ?? params.soil_effect },
    efficiency_factor: { factor: algoOverrides.efficiencyFactor ?? params.efficiency_factor },
    max_p_rate:        { rate:   algoOverrides.maxPRate         ?? MAX_P_RATE },
    max_k_rate:        { rate:   algoOverrides.maxKRate         ?? MAX_K_RATE },
    n_equation_parameter: {
      ...N_EQUATION_DEFAULTS,
      n_other: nOther,
      ...nEcuacion,   // overrides modo avanzado
    },
    strategy: {
      strategy,
      tillage,
    },
  }
}

// ─── Llamada al proxy ─────────────────────────────────────────────────────────

/**
 * Calcula las necesidades NPK llamando al proxy /api/sativum-algo.
 *
 * @param {object[]} cultivos
 * @param {object}   suelo      — resultado de normalizarSuelo()
 * @param {object}   opts       — mismos opts que ensamblarPayloadAlgo()
 * @returns {Promise<object|null>}
 *   Respuesta del motor: { recommendations: [{ n, p, k, ... }], ... }
 *   null si falla (degradación elegante)
 */
export async function calcularNPK(cultivos, suelo, opts = {}) {
  const payload = ensamblarPayloadAlgo(cultivos, suelo, opts)

  const res  = await fetch('/api/sativum-algo', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 503 && data?.stub) return null
    throw new Error(data?.error || `Sativum error ${res.status}`)
  }

  // ── Parche N leñosos (Trees) sin datos de residuo — 2026-07-28 ─────────
  // La API pública /fertilicalc/algo/ devuelve el N de cultivos "TREES"
  // ~125x inflado respecto a lo que muestra hoy la app oficial de Sativum,
  // pero SOLO cuando el catálogo NO tiene datos de composición del residuo
  // (res_n=0 — comprobado que en /nutrients/crops eso implica también
  // res_dry_matter/res_p/res_k=0 a la vez, nunca uno solo). Importante: NO
  // es lo mismo que "Fres/Residuos en campo=100%" (ese es un input de
  // manejo del usuario sobre cuánto residuo se incorpora al suelo, y es
  // igual al 100% en TODOS los casos probados, incluido Olivo — no es lo
  // que diferencia el comportamiento). Lo que varía es si el catálogo TIENE
  // dato de composición del residuo o no — probablemente por falta de
  // evidencia científica sólida para la mayoría de especies, no porque su
  // residuo realmente aporte cero. Verificado con 3 casos reales de
  // producción y catálogo muy distintos: Almendro, Pistacho, Naranjo —
  // mismo factor ~100/efic en los tres, desviación <0.25%.
  //
  // CRÍTICO (caso Olivo, 2026-07-28): con datos de residuo reales (res_n=
  // 1.5% para Olivo, el único de los 29 cultivos "Trees" del catálogo con
  // esa composición informada), el N bruto del gemelo YA COINCIDE EXACTO
  // con la oficial (11.4 kg/ha ambos) SIN NINGÚN PARCHE — la fórmula
  // general (con residuo) está bien implementada en la API. El bug vive
  // específicamente en la rama reducida que se activa cuando no hay dato
  // de residuo, no en "TREES" en general. Aplicar esta corrección sin
  // comprobar el residuo ROMPERÍA Olivo (y cualquier otro leñoso que en el
  // futuro tenga datos de residuo). Por eso el gate comprueba también
  // res_n === 0, no solo plant_species_group.
  //
  // Nota de mantenimiento: el catálogo /nutrients/crops (FertiliCalc) es
  // dinámico — ITACyL puede ir añadiendo datos de residuo reales para más
  // especies con el tiempo. Como el gate depende de `res_n` del propio
  // payload (no de una lista fija de cultivos), en cuanto un cultivo reciba
  // dato de residuo real, el parche dejará de aplicarse a él automáticamente,
  // sin tocar este código.
  //
  // Hipótesis del origen (pendiente de confirmar con ITACyL, David
  // Nafría): en la rama reducida (sin dato de residuo), la fórmula usa el
  // %MS del cultivo como valor bruto (p.ej. 65) en vez de como fracción
  // (0.65), y además divide por `efic` — el producto de ambos (×100 por
  // el %MS, ×1/efic) reproduce el factor observado. La app oficial, en
  // cambio, no aplica esa división por eficiencia en absoluto para este
  // caso, pese a que la propia ecuación 25.12 de Villalobos & Fereres
  // (2017) sí la contempla — así que el objetivo de este parche es igualar
  // lo que un usuario real ve HOY en la app oficial, no el valor
  // "textbook-correcto" que ni la propia oficial aplica.
  //
  // Corrección: multiplicar n por (efic/100) SOLO para TREES sin datos de
  // residuo (res_n falsy), usando el efic real que se mandó en el payload
  // (no un valor fijo), para que siga funcionando si algún día se
  // sobrescribe en modo avanzado.
  //
  // Alcance: acotado a leñosos (Trees) SIN dato de residuo — no se ha
  // detectado ni se sospecha el mismo problema en herbáceos/extensivos
  // (validados exactos en sesiones anteriores, p.ej. Patata/Brócoli
  // 2026-06-17), ni en leñosos con residuo real (Olivo, ya verificado).
  //
  // Si ITACyL corrige la API pública, este bloque debe retirarse.
  // Ver memoria: project_fertipro_sativum_bug_n_lenosos.md
  const efic = payload.n_equation_parameter?.efic
  if (data?.recommendations && typeof efic === 'number') {
    data.recommendations = data.recommendations.map((rec, i) => {
      const features = payload.rotation[i]?.crop_features
      const esLenoso = features?.plant_species_group === 'TREES'
      const sinDatoResiduo = !features?.res_n // 0, null o undefined → true
      if (!esLenoso || !sinDatoResiduo || typeof rec?.n !== 'number') return rec
      return { ...rec, n: rec.n * (efic / 100) }
    })
  }

  return data
}
