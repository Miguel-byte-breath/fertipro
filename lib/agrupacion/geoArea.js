/**
 * Area geodesica (m2) de una geometria GeoJSON Polygon/MultiPolygon, sin
 * dependencias externas. Formula de exceso esferico (Chamberlain & Duquette,
 * "Some Algorithms for Polygons on a Sphere", JPL 2007) - la misma que usa
 * turf.js internamente para @turf/area.
 *
 * Uso en este repo: verificar el parser de lib/wktToGeoJSON.js contra las 14
 * filas reales, comparando el area recalculada aqui con la columna
 * "Superficie" ya registrada (ha) - ver lib/test_wktToGeoJSON.mjs.
 */

const RADIO_TIERRA_M = 6378137; // radio ecuatorial WGS84, mismo que usa turf

function radianes(grados) {
  return (grados * Math.PI) / 180;
}

/** Area de un solo anillo (array de [lon,lat]), en m2, sin signo. */
function areaAnillo(anillo) {
  const n = anillo.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p1 = anillo[i];
    const p2 = anillo[(i + 1) % n];
    const p3 = anillo[(i + 2) % n];
    total += (radianes(p3[0]) - radianes(p1[0])) * Math.sin(radianes(p2[1]));
  }
  return Math.abs((total * RADIO_TIERRA_M * RADIO_TIERRA_M) / 2);
}

/** Area de un "Polygon.coordinates" (anillo exterior menos huecos), en m2. */
function areaPolygonCoords(anillos) {
  if (!anillos || anillos.length === 0) return 0;
  const exterior = areaAnillo(anillos[0]);
  const huecos = anillos.slice(1).reduce((acc, h) => acc + areaAnillo(h), 0);
  return Math.max(0, exterior - huecos);
}

/** area(geometria GeoJSON) -> m2. Soporta Polygon y MultiPolygon. */
export function area(geometria) {
  if (!geometria || !geometria.type) {
    throw new Error("area(): geometria GeoJSON no valida");
  }
  if (geometria.type === "Polygon") {
    return areaPolygonCoords(geometria.coordinates);
  }
  if (geometria.type === "MultiPolygon") {
    return geometria.coordinates.reduce((acc, parte) => acc + areaPolygonCoords(parte), 0);
  }
  throw new Error(`area(): tipo de geometria no soportado: ${geometria.type}`);
}

/** Atajo: area en hectareas (1 ha = 10.000 m2). */
export function areaHa(geometria) {
  return area(geometria) / 10000;
}
