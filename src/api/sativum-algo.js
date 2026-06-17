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
 * @returns {object} crop_features listo para el payload
 */
function cultivoToCropFeatures(cultivo, opts = {}) {
  const { recogeResiduos = false, quemaResiduos = false } = opts

  // Regla del residuo: Cereales con fres=10 y no recoge paja → f_res=100
  let fRes = cultivo.fres ?? 100
  if (
    cultivo.plantSpeciesGroup?.toUpperCase() === 'CEREALS' &&
    cultivo.fres === 10 &&
    !recogeResiduos
  ) {
    fRes = 100
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
 * @param {object[]} cultivos   — array de { cultivo, cropYield, cv, recogeResiduos, quemaResiduos }
 * @param {object}   suelo      — resultado de normalizarSuelo()
 * @param {object}   opts
 * @param {string}   opts.strategy          — SUFFICIENCY|REDUCED|MAINTENANCE|MAXIMUM
 * @param {boolean}  [opts.tillage=false]   — ¿laboreo?
 * @param {number}   [opts.cec=220]         — CEC manual (meq/kg) hasta que ITACyL publique capa
 * @param {object}   [opts.riego]           — { no3MgL, dotacionM3 } agua de riego
 * @param {object}   [opts.nEcuacion]       — overrides avanzados de n_equation_parameter
 * @returns {object} payload listo para enviar al proxy /api/sativum-algo
 */
export function ensamblarPayloadAlgo(cultivos, suelo, opts = {}) {
  const {
    strategy      = 'MAINTENANCE',
    tillage       = false,
    cec           = 220,
    riego         = null,
    nEcuacion     = {},
    algoOverrides = {},   // overrides opcionales de los ajustes del algoritmo
  } = opts

  const soilType = suelo.soilType ?? 'LOAM'
  const params   = getAlgoParams(strategy, soilType)

  // N extra del agua de riego
  const nAgua = riego ? calcularNAgua(riego.no3MgL, riego.dotacionM3) : 0

  // n_other = deposición atmosférica (10) + N del agua de riego
  const nOther = (N_EQUATION_DEFAULTS.n_other + nAgua)

  const rotation = cultivos.map(({ cultivo, cropYield, cv = 0, recogeResiduos = false, quemaResiduos = false }) => ({
    crop_yield:       cropYield,
    cv:               cv,
    collect_residues: recogeResiduos,
    burn_residues:    quemaResiduos,
    // green_manure: pendiente verificar nombre exacto del campo en API Sativum
    crop_features:    cultivoToCropFeatures(cultivo, { recogeResiduos, quemaResiduos }),
  }))

  console.debug('[algo payload] rotation:', JSON.stringify(rotation))
  console.debug('[algo payload] n_equation_parameter:', { ...N_EQUATION_DEFAULTS, n_other: nOther, ...nEcuacion })

  return {
    rotation,
    soil: {
      soil_type: soilType,
    },
    sample: {
      som:    suelo.organicMatter ?? 2,
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

  try {
    const res  = await fetch('/api/sativum-algo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 503 && data?.stub) return null
      throw new Error(data?.error || `sativum-algo ${res.status}`)
    }
    return data
  } catch (err) {
    console.warn('[sativum-algo]', err.message)
    return null
  }
}
