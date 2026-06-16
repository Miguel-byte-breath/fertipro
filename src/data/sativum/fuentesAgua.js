/**
 * src/data/sativum/fuentesAgua.js
 *
 * Catálogo de fuentes de agua de riego (SIEX / Cuaderno de Explotación).
 * Código 2 (Subterránea) es el único que trae NO₃ y K del ArcGIS Sativum
 * (capas 9 y 8 respectivamente). El resto requiere entrada manual.
 *
 * Ref: SIEX – Sistema de Información de Explotaciones Agrícolas (MAPA).
 */

/** Código SIEX de agua subterránea (activa datos ArcGIS) */
export const FUENTE_SUBTERRANEA = 2

/** Código SIEX de "sin riego" */
export const FUENTE_SIN_RIEGO = 0

export const FUENTES_AGUA = [
  { id: 0, label: 'Sin riego' },
  { id: 1, label: 'Superficial (río, canal, embalse)' },
  { id: 2, label: 'Subterránea (pozo, sondeo)' },
  { id: 3, label: 'Desalada' },
  { id: 4, label: 'Depurada / Regenerada' },
  { id: 5, label: 'Pluvial / Lluvia' },
  { id: 6, label: 'Otras' },
]
