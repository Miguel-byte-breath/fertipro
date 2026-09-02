/**
 * Parser WKT -> GeoJSON, sin dependencias externas.
 *
 * Paso 2 del roadmap (ver CLAUDE.md, seccion "Hoja de ruta - dos vias de
 * consumo de la plantilla"): utilidad aislada, pensada para reutilizarse tal
 * cual mas adelante en agrupar.js/calcular.js (via B, lote local) y, si algun
 * dia se aborda la via A (boton "Cargar plantilla" en el navegador de los
 * gemelos, fase separada con su propio OK explicito de Miguel), tambien ahi
 * sin reescribirla.
 *
 * Alcance deliberadamente acotado:
 *  - Soporta POLYGON y MULTIPOLYGON (2D), con anillos interiores (huecos) por
 *    si aparecen en datos futuros, aunque ninguna de las 14 filas reales de
 *    este repo los tiene hoy (verificado antes de escribir esto).
 *  - NO reproyecta ni detecta CRS - asume siempre coordenadas geograficas
 *    (lon, lat) en WGS84/ETRS89, igual que el resto del ecosistema FertiPRO/
 *    Sativum (ver "Reproyeccion UTM->EPSG:4326" en el backlog de fertipro y
 *    fertipro-api-sativum: riesgo latente conocido y diferido, no resuelto
 *    aqui - esta utilidad no lo intenta resolver de pasada).
 *  - NO soporta POINT/LINESTRING/GEOMETRYCOLLECTION - la columna "Geometria"
 *    de la plantilla siempre es una unidad de cultivo (superficie), nunca un
 *    punto o una linea.
 */

/**
 * NOTA (2026-09-01): copia deliberadamente independiente de
 * `src/utils/wktToGeoJSON.js` de este mismo repo (que a su vez añadió
 * geometryToWKT/featureToWKT para el roundtrip de exportar/reimportar un
 * plan). Esta copia vive junto al resto de la lógica de agrupación
 * vendorizada de `fertipro-test/plantilla` (ver lib/agrupacion/), para que
 * ese paquete quede autocontenido y no dependa de un fichero que evoluciona
 * por otro motivo. Si src/utils/wktToGeoJSON.js corrige un bug en parseWKT,
 * revisar si aplica aquí también.
 */

/** Convierte "12.345 41.678" -> [12.345, 41.678]. Tolera espacios repetidos. */
function parsePoint(texto) {
  const partes = texto.trim().split(/\s+/).map(Number);
  if (partes.length < 2 || partes.some((n) => Number.isNaN(n))) {
    throw new Error(`Coordenada WKT invalida: "${texto}"`);
  }
  // Solo 2D: si hubiera Z/M (3er o 4o numero), se ignora a proposito.
  return [partes[0], partes[1]];
}

/** Convierte "12 41, 13 42, 12 41" -> [[12,41],[13,42],[12,41]]. */
function parseRing(texto) {
  const anillo = texto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(parsePoint);

  if (anillo.length < 3) {
    throw new Error(`Anillo WKT con menos de 3 vertices (${anillo.length})`);
  }
  const [x0, y0] = anillo[0];
  const [xn, yn] = anillo[anillo.length - 1];
  if (x0 !== xn || y0 !== yn) {
    // Cierre defensivo: mejor cerrar el anillo que descartar una geometria
    // real por un anillo no cerrado exactamente (redondeo/exportacion).
    anillo.push([x0, y0]);
  }
  return anillo;
}

/**
 * Extrae los bloques "(...)" de primer nivel dentro de un texto ya despojado
 * de un nivel de parentesis exterior. Ej.: "(1 2, 3 4), (5 6, 7 8)" ->
 * ["1 2, 3 4", "5 6, 7 8"].
 */
function splitTopLevelParens(texto) {
  const bloques = [];
  let profundidad = 0;
  let inicio = -1;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === "(") {
      if (profundidad === 0) inicio = i + 1;
      profundidad++;
    } else if (ch === ")") {
      profundidad--;
      if (profundidad === 0) bloques.push(texto.slice(inicio, i));
    }
  }
  return bloques;
}

/** "((1 2, 3 4, 1 2))" o "((1 2,...), (5 6,...))" -> [[[lon,lat],...], ...] */
function parsePolygonBody(texto) {
  return splitTopLevelParens(texto).map(parseRing);
}

/**
 * parseWKT(wkt) -> geometria GeoJSON { type: 'Polygon'|'MultiPolygon', coordinates }
 * Lanza Error con mensaje claro si el WKT no es POLYGON/MULTIPOLYGON valido.
 */
export function parseWKT(wkt) {
  if (typeof wkt !== "string" || !wkt.trim()) {
    throw new Error("parseWKT: WKT vacio o no es una cadena de texto");
  }
  const texto = wkt.trim();
  const m = texto.match(/^(MULTIPOLYGON|POLYGON)\s*\(([\s\S]*)\)\s*$/i);
  if (!m) {
    throw new Error(
      `parseWKT: solo se soporta POLYGON/MULTIPOLYGON. Recibido: "${texto.slice(0, 40)}..."`
    );
  }
  const tipo = m[1].toUpperCase();
  const cuerpo = m[2];

  if (tipo === "POLYGON") {
    return { type: "Polygon", coordinates: parsePolygonBody(cuerpo) };
  }
  // MULTIPOLYGON: cada bloque de primer nivel es un POLYGON completo, con sus
  // propios anillos (exterior + huecos) dentro.
  const partes = splitTopLevelParens(cuerpo).map(parsePolygonBody);
  if (partes.length === 0) {
    throw new Error("parseWKT: MULTIPOLYGON sin ninguna parte");
  }
  return { type: "MultiPolygon", coordinates: partes };
}

/** Envuelve la geometria en un Feature GeoJSON completo (uso en mapa/turf). */
export function wktToFeature(wkt, properties = {}) {
  return { type: "Feature", properties, geometry: parseWKT(wkt) };
}
