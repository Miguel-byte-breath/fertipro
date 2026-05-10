/**
 * src/calculo/algoritmo.js — núcleo del simulador FertiPRO.
 *
 * STUB inicial. Implementación pendiente — definir entradas, salidas y
 * fórmulas con el equipo agronómico antes de codificar.
 *
 * Objetivo del cálculo:
 *   Necesidades de fertilización (kg/ha por nutriente) = Salidas − Aportes
 *
 *   Salidas:
 *     - Extracciones del cultivo según JSON de extracciones, ajustadas a
 *       producción esperada (t/ha) y a la fracción comercial vs. residuos.
 *
 *   Aportes:
 *     - Análisis de suelo (N residual, P y K asimilables, Mg, Ca, oligos…).
 *     - Análisis del agua de riego (NO₃, K, Ca, Mg, S, B…).
 *     - Enmienda orgánica (compost, estiércol, gallinaza…).
 *     - Mineralización de la materia orgánica del suelo.
 *     - En leguminosas/Fabaceae fijadoras: fijación simbiótica de N₂.
 *
 * @example
 *   const necesidades = calcularNecesidades({
 *     cultivo,                   // objeto del JSON de extracciones
 *     produccion_t_ha: 7.5,
 *     superficie_ha:   1.2,
 *     suelo:  { N_total_pct: 0.12, P_asimilable_ppm: 18, K_asimilable_ppm: 240, ... },
 *     agua:   { NO3_mg_l: 8, K_mg_l: 12, ... },
 *     dosis_riego_m3_ha: 4500,
 *     enmienda: { tipo: 'estiercol_vacuno', dosis_t_ha: 20, ms_pct: 25, N_pct: 0.5, ... },
 *   })
 *   // → { N: 120, P: 35, K: 80, ... }  (kg/ha de fertilizante a aportar)
 */

/**
 * Extrae el total de un nutriente (kg/ha) que sale del campo con el cultivo.
 * Usa parte comercial + parte no comercial * residuos_pct.
 *
 * @param {object} cultivo               objeto del JSON de extracciones
 * @param {string} nutriente             'N' | 'P' | 'K' | ...
 * @param {number} produccion_t_ha       producción comercial estimada (t/ha)
 * @returns {number}                     extracción total del nutriente (kg/ha)
 */
export function extraccionPorNutriente(cultivo, nutriente, produccion_t_ha) {
  if (!cultivo || !produccion_t_ha) return 0

  const ms       = (cultivo.params?.ms_pct       ?? 0) / 100  // fracción 0-1
  const hi       = (cultivo.params?.hi_pct       ?? 0) / 100
  const residuos = (cultivo.params?.residuos_pct ?? 0) / 100

  const pcPct  = cultivo.parte_comercial?.nutrientes_pct?.[nutriente]
  const pncPct = cultivo.parte_no_comercial?.nutrientes_pct?.[nutriente]

  // Producción de MS comercial (t/ha) = producción comercial × MS%
  const msComercial = produccion_t_ha * ms

  // MS no comercial estimada a partir del Harvest Index:
  //   total_ms = comercial / hi          (si hi > 0)
  //   no_comercial = total_ms - comercial
  let msNoComercial = 0
  if (hi > 0 && hi < 1) {
    const msTotal = msComercial / hi
    msNoComercial = (msTotal - msComercial) * residuos // solo la fracción de residuos que se exporta del campo
  }

  const ext_pc  = (pcPct  ?? 0) / 100 * msComercial    * 1000 // % → kg/t · t/ha = kg/ha
  const ext_pnc = (pncPct ?? 0) / 100 * msNoComercial  * 1000

  return ext_pc + ext_pnc
}

/**
 * Calcula necesidades por nutriente a partir de un escenario completo.
 * Devuelve únicamente las extracciones por ahora (TODO: aportes).
 *
 * @param {object} params
 * @param {object} params.cultivo         del JSON de extracciones
 * @param {number} params.produccion_t_ha producción comercial esperada (t/ha)
 * @returns {object} { extracciones: { N, P, K, ... }, necesidades: { ... }, _todo: string[] }
 */
export function calcularNecesidades({ cultivo, produccion_t_ha }) {
  const NUTRIENTES = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Fe', 'Cu', 'Mn', 'Zn', 'B', 'Mo']
  const extracciones = {}
  for (const n of NUTRIENTES) {
    extracciones[n] = extraccionPorNutriente(cultivo, n, produccion_t_ha)
  }

  return {
    extracciones,
    // TODO: integrar análisis de suelo + agua + enmienda + fijación simbiótica
    necesidades: extracciones,
    _todo: [
      'Análisis de suelo (Sativum/ITACyL)',
      'Análisis del agua de riego (Sativum/ITACyL)',
      'Enmienda orgánica',
      'Mineralización de MO',
      'Fijación simbiótica (n_fijado)',
    ],
  }
}
