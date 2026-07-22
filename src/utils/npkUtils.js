/**
 * src/utils/npkUtils.js
 *
 * Utilidades compartidas para cálculo NPK efectivo.
 * Usadas por FertilizanteManualPanel y ResultadosCard.
 */

/**
 * Años completos transcurridos entre `fechaAplicacion` y `fechaReferencia`,
 * según el ANIVERSARIO real de la aplicación — no el año natural/calendario.
 * Confirmado con ITACyL (2026-07-22): año 0 dura hasta el día antes del primer
 * aniversario de la aplicación; año 1 desde ese aniversario hasta el día antes
 * del segundo; año 2 desde el segundo aniversario en adelante. Mismo algoritmo
 * que calcular una edad (resta años de calendario y resta 1 si el aniversario
 * de este año todavía no ha llegado a la fecha de referencia).
 *
 * @param {string} fechaAplicacion  — ISO date string (YYYY-MM-DD)
 * @param {string} fechaReferencia  — ISO date string (YYYY-MM-DD)
 * @returns {number} años transcurridos, acotado a [0,2] (solo hay yearPercent0/1/2)
 */
export function aniosTranscurridos(fechaAplicacion, fechaReferencia) {
  const aplic = new Date(fechaAplicacion + 'T00:00:00')
  const ref   = new Date(fechaReferencia + 'T00:00:00')
  let years = ref.getFullYear() - aplic.getFullYear()
  const aniversario = new Date(aplic)
  aniversario.setFullYear(aplic.getFullYear() + years)
  if (aniversario > ref) years -= 1
  return Math.min(2, Math.max(0, years))
}

/**
 * Calcula N/P2O5/K2O aplicados y efectivos teniendo en cuenta
 * la fracción mineralizable del ciclo actual para fertilizantes orgánicos.
 *
 * Para no-orgánicos (appliesAnnualEffectiveness=false o ausente):
 *   efN === brutoN, pct === 100, esOrganico === false
 *
 * Para orgánicos:
 *   delta = aniosTranscurridos(fechaAplicacion, fechaInicioCiclo) — por aniversario real, no año natural
 *   pct   = item.yearPercent{delta} ?? 100
 *   ef*   = bruto* x pct / 100
 *
 * @param {object} item          — planItem con campos n, p2o5, k2o, cantidad,
 *                                  fechaAplicacion, appliesAnnualEffectiveness,
 *                                  yearPercent0/1/2
 * @param {string} fechaInicioCiclo — ISO date string (YYYY-MM-DD) o vacío
 * @returns {{ efN, efP2o5, efK2o, brutoN, brutoP2o5, brutoK2o, pct, esOrganico }}
 */
export function calcNpkEfectivo(item, fechaInicioCiclo) {
  const dose      = Number(item.cantidad) || 0
  const brutoN    = (item.n    ?? 0) * dose / 100
  const brutoP2o5 = (item.p2o5 ?? 0) * dose / 100
  const brutoK2o  = (item.k2o  ?? 0) * dose / 100

  if (!item.appliesAnnualEffectiveness || !item.fechaAplicacion) {
    return {
      efN: brutoN, efP2o5: brutoP2o5, efK2o: brutoK2o,
      brutoN, brutoP2o5, brutoK2o,
      pct: 100, esOrganico: false,
    }
  }

  // Si no hay fecha de inicio de ciclo, usar el día de hoy como referencia
  // (normalmente delta = 0 → aplica yearPercent0). Es mejor que mostrar el bruto.
  const cicloRef = fechaInicioCiclo || new Date().toISOString().slice(0, 10)
  const delta    = aniosTranscurridos(item.fechaAplicacion, cicloRef)
  const pct      = item[`yearPercent${delta}`] ?? 100

  return {
    efN:    brutoN    * pct / 100,
    efP2o5: brutoP2o5 * pct / 100,
    efK2o:  brutoK2o  * pct / 100,
    brutoN, brutoP2o5, brutoK2o,
    pct, esOrganico: true,
  }
}
