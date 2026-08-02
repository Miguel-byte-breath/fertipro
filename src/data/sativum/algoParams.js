/**
 * src/data/sativum/algoParams.js
 *
 * Parámetros del motor FertiliCalc por estrategia × tipo de suelo.
 * Usados para construir el payload de POST /fertilicalc/algo/.
 *
 * Fuente: ITACyL / Sativum (validado con respuestas reales de la API).
 * MAXIMUM corregido 2026-08-02 contra el fichero oficial de Sativum
 * "ValoresPorDefectoNutrientes_PorSueloYEstrategia.json" (antes tenía valores
 * artesanales, sin fuente documentada). REDUCED/SUFFICIENCY ya coincidían
 * exactas con ese fichero. MAINTENANCE alineado el mismo día (2026-08-02):
 * el fichero oficial da, fila a fila por textura, los mismos valores que
 * MAXIMUM — antes tenía también valores artesanales propios (p.ej. CLAY
 * k_threshold=225/efficiency_factor=2.6 en vez de 300/5.0). Se alinea aunque
 * el servidor de ITACyL ignore el `sample` (análisis real de P/K/pH) bajo
 * MAINTENANCE (verificado sesión 2026-07-28, ver CLAUDE.md de
 * fertipro-test/plantilla) — p_threshold/k_threshold/efficiency_factor NO
 * forman parte del `sample`, viajan siempre en el payload según soil_type
 * sin condicionar a la estrategia (ver sativum-algo.js), y son además los
 * valores que se muestran como placeholder en el panel avanzado.
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
    SANDY:      { p_threshold: 10, k_threshold: 100, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.2 },
    SANDY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.2 },
    LOAM:       { p_threshold: 12, k_threshold: 175, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.7 },
    SILTY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.7 },
    CLAY_LOAM:  { p_threshold: 12, k_threshold: 175, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.0 },
    CLAY:       { p_threshold: 20, k_threshold: 300, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 5.0 },
  },
  MAINTENANCE: {
    SANDY:      { p_threshold: 10, k_threshold: 100, soil_effect: 1.68, bulk_density: 1.68, efficiency_factor: 1.2 },
    SANDY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.56, bulk_density: 1.56, efficiency_factor: 1.2 },
    LOAM:       { p_threshold: 12, k_threshold: 175, soil_effect: 1.43, bulk_density: 1.43, efficiency_factor: 1.7 },
    SILTY_LOAM: { p_threshold: 12, k_threshold: 175, soil_effect: 1.41, bulk_density: 1.41, efficiency_factor: 1.7 },
    CLAY_LOAM:  { p_threshold: 12, k_threshold: 175, soil_effect: 1.31, bulk_density: 1.31, efficiency_factor: 2.0 },
    CLAY:       { p_threshold: 20, k_threshold: 300, soil_effect: 1.21, bulk_density: 1.21, efficiency_factor: 5.0 },
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
