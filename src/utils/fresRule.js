/**
 * src/utils/fresRule.js
 *
 * Regla compartida de f_res (% de residuo que queda en campo) para cualquier
 * cultivo de la rotación (anterior o actual). Usada por CultivoAnteriorPanel.jsx
 * y CultivoCard.jsx para que el cálculo del default y el gating de edición no
 * puedan desincronizarse entre los dos paneles.
 *
 * Regla de negocio (confirmada contra la app oficial de Sativum, 2026-07-17):
 *   - Si NO se recogen los residuos (recogeResiduos=false), el 100% del residuo
 *     queda en campo — incluido si se marca "quema residuos" (quemar no exporta
 *     nada del campo; las cenizas con sus minerales se quedan, y la pérdida de
 *     N/S por volatilización ya la modela aparte la ecuación de N vía el flag
 *     burn_residues, no vía f_res). El valor no es editable en este caso.
 *   - Solo si se recogen los residuos (recogeResiduos=true) tiene sentido
 *     preguntar cuánto queda en campo (altura de siega, eficiencia de recogida),
 *     y el default pasa a ser el f_res de catálogo (regla B7 para cereales:
 *     fres=10 en catálogo). Editable independientemente de si además se marca
 *     "quema residuos" (se puede recoger la mayoría y quemar el rastrojo que
 *     queda).
 */

/**
 * Calcula el f_res automático (B7) según cultivo y si se recogen los residuos.
 * Igual que la lógica de cultivoToCropFeatures en sativum-algo.js.
 *
 * @param {object|null} cultivo
 * @param {boolean} recogeResiduos
 * @returns {number|null}
 */
export function computeAutoFRes(cultivo, recogeResiduos) {
  if (!cultivo) return null
  if (
    cultivo.plantSpeciesGroup?.toUpperCase() === 'CEREALS' &&
    cultivo.fres === 10 &&
    !recogeResiduos
  ) return 100
  return cultivo.fres ?? 100
}

/**
 * ¿Debe estar editable el input "Residuos en campo (%)"?
 * Única condición: que se hayan marcado como recogidos — independiente de si
 * además se marca "quema residuos".
 *
 * @param {boolean} recogeResiduos
 * @returns {boolean}
 */
export function fResEditable(recogeResiduos) {
  return recogeResiduos === true
}
