/**
 * src/utils/npkUtils.js
 *
 * Utilidades compartidas para cálculo NPK efectivo.
 * Usadas por FertilizanteManualPanel y ResultadosCard.
 */

/**
 * Calcula N/P2O5/K2O aplicados y efectivos teniendo en cuenta
 * la fracción mineralizable del ciclo actual para fertilizantes orgánicos.
 *
 * Para no-orgánicos (appliesAnnualEffectiveness=false o ausente):
 *   efN === brutoN, pct === 100, esOrganico === false
 *
 * Para orgánicos:
 *   delta = year(fechaInicioCiclo) - year(fechaAplicacion), clamp [0,2]
 *   pct   = item.yearPercent{delta} ?? 100
 *   ef*   = bruto* × pct / 100
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

  if (!item.appliesAnnualEffectiveness || !item.fechaAplicacion || !fechaInicioCiclo) {
    return {
      efN: brutoN, efP2o5: brutoP2o5, efK2o: brutoK2o,
      brutoN, brutoP2o5, brutoK2o,
      pct: 100, esOrganico: false,
    }
  }

  const yearInicio = new Date(fechaInicioCiclo  + 'T00:00:00').getFullYear()
  const yearAplic  = new Date(item.fechaAplicacion + 'T00:00:00').getFullYear()
  const delta = Math.min(2, Math.max(0, yearInicio - yearAplic))
  const pct   = item[`yearPercent${delta}`] ?? 100

  return {
    efN:    brutoN    * pct / 100,
    efP2o5: brutoP2o5 * pct / 100,
    efK2o:  brutoK2o  * pct / 100,
    brutoN, brutoP2o5, brutoK2o,
    pct, esOrganico: true,
  }
}
