/**
 * src/data/sativum/algoParams.js
 *
 * Parámetros del motor FertiliCalc por estrategia × tipo de suelo.
 * Usados para construir el payload de POST /fertilicalc/algo/.
 *
 * Fuente: ITACyL / Sativum (validado con respuestas reales de la API).
 *
 * Restricciones globales del algoritmo:
 *   max_p_rate: 100 kg P/ha
 *   max_k_rate: 275 kg K/ha
 */

export const MAX_P_RATE = 100
export const MAX_K_RATE = 275

/**
 * Tabla de parámetros indexada por [strategy][soilType].
 *
 * strategy: MAXIMUM | MAINTENANCE | REDUCED | SUFFICIENCY
 * soilType: SANDY | SANDY_LOAM | LOAM | SILTY_LOAM | CLAY_LOAM | CLAY
 */
export const ALGO_PARAMS = {
  MAXIMUM: {
    SANDY:      { p_threshold: 12, k_threshold: 175, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.5 },
    SANDY_LOAM: { p_threshold: 14, k_threshold: 200, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.5 },
    LOAM:       { p_threshold: 14, k_threshold: 200, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.8 },
    SILTY_LOAM: { p_threshold: 14, k_threshold: 200, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.8 },
    CLAY_LOAM:  { p_threshold: 14, k_threshold: 200, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.5 },
    CLAY:       { p_threshold: 16, k_threshold: 250, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 3.0 },
  },
  MAINTENANCE: {
    SANDY:      { p_threshold: 10, k_threshold: 125, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.3 },
    SANDY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.4 },
    LOAM:       { p_threshold: 12, k_threshold: 175, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.7 },
    SILTY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.7 },
    CLAY_LOAM:  { p_threshold: 12, k_threshold: 175, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.1 },
    CLAY:       { p_threshold: 14, k_threshold: 225, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 2.6 },
  },
  REDUCED: {
    SANDY:      { p_threshold:  8, k_threshold: 100, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.1 },
    SANDY_LOAM: { p_threshold: 10, k_threshold: 150, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.1 },
    LOAM:       { p_threshold: 10, k_threshold: 150, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.5 },
    SILTY_LOAM: { p_threshold: 10, k_threshold: 150, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.5 },
    CLAY_LOAM:  { p_threshold: 10, k_threshold: 150, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.0 },
    CLAY:       { p_threshold: 12, k_threshold: 200, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 2.5 },
  },
  SUFFICIENCY: {
    SANDY:      { p_threshold:  8, k_threshold: 100, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.1 },
    SANDY_LOAM: { p_threshold: 10, k_threshold: 150, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.1 },
    LOAM:       { p_threshold: 10, k_threshold: 150, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.5 },
    SILTY_LOAM: { p_threshold: 10, k_threshold: 150, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.5 },
    CLAY_LOAM:  { p_threshold: 10, k_threshold: 150, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.0 },
    CLAY:       { p_threshold: 12, k_threshold: 200, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 2.5 },
  },
}

/**
 * Devuelve los parámetros para una estrategia y tipo de suelo dados.
 * Si la combinación no existe devuelve defaults seguros.
 *
 * @param {string} strategy  — MAXIMUM | MAINTENANCE | REDUCED | SUFFICIENCY
 * @param {string} soilType  — SANDY | SANDY_LOAM | LOAM | SILTY_LOAM | CLAY_LOAM | CLAY
 * @returns {object}
 */
export function getAlgoParams(strategy, soilType) {
  return (
    ALGO_PARAMS[strategy]?.[soilType] ?? {
      p_threshold:      12,
      k_threshold:      175,
      soil_effect:      1.45,
      bulk_density:     1.45,
      efficiency_factor: 1.2,
    }
  )
}

/**
 * Valores por defecto para n_equation_parameter.
 * El usuario puede sobreescribirlos en modo avanzado.
 */
export const N_EQUATION_DEFAULTS = {
  n_end:   10,
  n_other: 10,
  n_lost:  0,
  f_nr:    0.2,
  beta_pl: 0.8,
  efic:    0.8,
}
