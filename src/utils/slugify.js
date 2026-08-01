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

/**
 * sanitizarNombreFichero — misma "sanitización ligera" que usa `calcular.js`
 * (fertipro-test/plantilla, generación masiva de planes por lote) para nombrar
 * los ficheros de `salidas/`: solo quita los caracteres realmente prohibidos
 * en un nombre de fichero (`\ / : * ? " < > |`), sin tocar mayúsculas, tildes
 * ni guiones. A diferencia de `slugify()` (que sí normaliza todo a minúsculas/
 * guión bajo), esta función preserva el dato tal cual esté escrito — se usa
 * para que los ficheros exportados desde la web (NIF + nombre del plan) salgan
 * con el mismo aspecto que los generados en lote (ej. "B25748377_2026-
 * ALMENDRO-MONZÓN-04"), no en minúsculas con guión bajo.
 *
 *   sanitizarNombreFichero('2026-ALMENDRO-MONZÓN-04') → '2026-ALMENDRO-MONZÓN-04'
 *   sanitizarNombreFichero('B25748377')                → 'B25748377'
 */
export function sanitizarNombreFichero(str) {
  return String(str ?? '').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 90) || 'sin_nombre'
}
