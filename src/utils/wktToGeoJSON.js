/**
 * src/utils/wktToGeoJSON.js — FertiPRO × Sativum
 *
 * Parser WKT <-> GeoJSON, sin dependencias externas.
 *
 * Copia literal (sin reescribir) de `C:\work\fertipro\src\utils\wktToGeoJSON.js`
 * (motor propio), que a su vez copió `parseWKT`/`wktToFeature` tal cual de
 * `C:\work\fertipro-test\plantilla\lib\wktToGeoJSON.js` — ya verificado ahí
 * contra shapely/pyproj (ver CLAUDE.md de fertipro-test). Se reutiliza aquí
 * para leer/escribir la hoja opcional "Recintos (WKT)" de un plan de abonado
 * (generada por `calcular.js`, lote local de cooperativas, o reexportada por
 * esta misma app tras importar un plan con geometría) — ver App.jsx,
 * `pintarRecintosDePlan`/`handleExportarPlan`.
 *
 * `geometryToWKT`/`featureToWKT` (sentido inverso, GeoJSON -> WKT) permiten
 * reexportar la geometría VIVA de un recinto importado si el técnico lo edita
 * en el mapa (Geoman) antes de reexportar — sin esto, un plan reexportado
 * llevaría siempre el WKT original importado, aunque se hubiera movido un
 * vértice. Redondeo a 8 decimales (~1,1 mm de precisión en el ecuador) para
 * evitar cadenas kilométricas por ruido de coma flotante tras editar con
 * Leaflet/Geoman.
 *
 * Alcance deliberadamente acotado (igual que el original):
 *  - Soporta POLYGON y MULTIPOLYGON (2D), con anillos interiores (huecos).
 *  - NO reproyecta ni detecta CRS - asume siempre coordenadas geograficas
 *    (lon, lat) en WGS84/ETRS89, igual que el resto del ecosistema FertiPRO/
 *    Sativum (ver "Reproyeccion UTM->EPSG:4326" en el backlog: riesgo latente
 *    conocido y diferido, no resuelto aqui).
 *  - NO soporta POINT/LINESTRING/GEOMETRYCOLLECTION.
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

// ─── Sentido inverso: GeoJSON -> WKT ────────────────────────────────────────

const round8 = (n) => Math.round(Number(n) * 1e8) / 1e8;

/** [[lon,lat],...] -> "lon lat, lon lat, ..." */
function ringToWKT(ring) {
  return ring.map(([lon, lat]) => `${round8(lon)} ${round8(lat)}`).join(", ");
}

/** [[[lon,lat],...], ...] (anillo exterior + huecos) -> "(...), (...)" */
function polygonBodyToWKT(rings) {
  return rings.map((ring) => `(${ringToWKT(ring)})`).join(", ");
}

/**
 * geometryToWKT(geometry) -> "POLYGON(...)" | "MULTIPOLYGON(...)"
 * Inverso de parseWKT. Lanza Error si el tipo no es Polygon/MultiPolygon.
 */
export function geometryToWKT(geometry) {
  if (!geometry?.type) throw new Error("geometryToWKT: geometria vacia o sin tipo");
  if (geometry.type === "Polygon") {
    return `POLYGON(${polygonBodyToWKT(geometry.coordinates)})`;
  }
  if (geometry.type === "MultiPolygon") {
    const partes = geometry.coordinates.map((rings) => `(${polygonBodyToWKT(rings)})`).join(", ");
    return `MULTIPOLYGON(${partes})`;
  }
  throw new Error(`geometryToWKT: tipo no soportado "${geometry.type}"`);
}

/** Feature GeoJSON completo -> WKT de su geometria. */
export function featureToWKT(feature) {
  return geometryToWKT(feature?.geometry);
}
