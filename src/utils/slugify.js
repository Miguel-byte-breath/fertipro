/**
 * src/utils/slugify.js — convierte un texto en un slug ASCII para nombres de
 * fichero descargados (sin tildes, sin espacios, sin símbolos raros).
 *
 *   slugify('Parcela 1')       → 'parcela_1'
 *   slugify('Hoja Olivar Sur') → 'hoja_olivar_sur'
 *   slugify('Ñ y á acentos')   → 'n_y_a_acentos'
 *
 * Vive en su propio fichero para evitar problemas de codificación con
 * caracteres diacríticos crudos dentro del regex.
 */
const DIACRITICS = /[̀-ͯ]/g

export function slugify(str) {
  return String(str ?? 'parcela')
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'parcela'
}
