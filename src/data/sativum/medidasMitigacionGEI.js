/**
 * Medidas de mitigación de GEI y amoniaco — Anexo V del RD 1051/2022
 *
 * Filtradas del catálogo FEGA "Buenas prácticas" (versión 2025):
 * se incluyen únicamente las medidas referenciadas en el Anexo V del RD 1051/2022
 * (técnicas de aplicación y manejo de fertilizantes que reducen emisiones de NH₃, N₂O y CH₄).
 * Se excluyen buenas prácticas de riego, fitosanitarias y gestión general.
 *
 * Cada medida incluye:
 *   codigoSiex  {number}  — código del catálogo SIEX/FEGA (para export)
 *   texto       {string}  — descripción oficial
 *   grupo       {string}  — categoría de agrupación en la UI
 */

export const GRUPOS_GEI = [
  'Técnicas de aplicación de purines y estiércol líquido',
  'Incorporación y estabilización de fertilizantes',
  'Específicas para cultivo de arroz',
]

export const MEDIDAS_MITIGACION_GEI = [
  // ── Grupo 1: Técnicas de aplicación de purines y estiércol líquido ──────
  {
    codigoSiex: 1,
    texto: 'Aplicación de purines mediante sistema de bandas con mangueras o tubos rígidos',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 2,
    texto: 'Aplicación de purines mediante sistema de bandas de discos o rejas',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 3,
    texto: 'Aplicación de purines mediante inyección',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 4,
    texto: 'Dilución de purines, seguida de técnicas tales como un sistema de riego de baja presión',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 5,
    texto: 'Acidificación de los purines',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 15,
    texto: 'Enterrado de purines y productos y materiales líquidos lo antes posible y siempre en las primeras 4 horas tras su aplicación',
    grupo: GRUPOS_GEI[0],
  },
  {
    codigoSiex: 16,
    texto: 'Empleo de inhibidores de la ureasa o de la nitrificación aplicados a purines, con supervisión profesional en caso de aplicación directa de los purines al suelo o a la balsa de purín',
    grupo: GRUPOS_GEI[0],
  },

  // ── Grupo 2: Incorporación y estabilización de fertilizantes ────────────
  {
    codigoSiex: 8,
    texto: 'Incorporación de los fertilizantes en el suelo por sistemas de inyección en profundidad',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 9,
    texto: 'Incorporación de los fertilizantes en el suelo mediante mezcla de los gránulos del fertilizante con el suelo',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 10,
    texto: 'Emplear gránulos de urea recubiertos de un polímero',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 11,
    texto: 'Aplicar un riego inmediatamente después de la fertilización con abonos a base de urea',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 14,
    texto: 'Empleo de inhibidores de la ureasa con productos fertilizantes a base de urea',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 18,
    texto: 'Enterrado de la urea, en el momento de su aplicación al suelo o, por lo menos, en las 4 horas siguientes',
    grupo: GRUPOS_GEI[1],
  },
  {
    codigoSiex: 19,
    texto: 'Empleo de productos fertilizantes nitrogenados con inhibidores de la nitrificación',
    grupo: GRUPOS_GEI[1],
  },

  // ── Grupo 3: Específicas para cultivo de arroz ──────────────────────────
  {
    codigoSiex: 13,
    texto: 'En el cultivo de arroz, realizar el abonado nitrogenado con el terreno seco',
    grupo: GRUPOS_GEI[2],
  },
  {
    codigoSiex: 35,
    texto: 'Siembra en seco (arroz)',
    grupo: GRUPOS_GEI[2],
  },
]
