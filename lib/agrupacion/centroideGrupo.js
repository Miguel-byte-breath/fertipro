// -*- coding: utf-8 -*-
/**
 * centroideGrupo.js — centroide ÚNICO de todo un grupo confirmado, ponderado
 * por área de cada parte, para poder hacer UNA SOLA llamada a ArcGIS ITACyL
 * por grupo (no una por recinto) — ver CLAUDE.md, sección "Reorientación de
 * calcular.js": el Portal de Suelos de España interpola sus capas edáficas
 * sobre ~6.859 puntos de muestreo nacionales, resolución real de cientos de
 * metros a varios km, muy por encima de la distancia típica entre recintos de
 * una misma hoja de cultivo — un único punto representativo por grupo no
 * pierde información real frente a consultar recinto a recinto.
 *
 * Reutiliza `parseWKT` (wktToGeoJSON.js) y `centroide` (geometria.js, ya
 * ponderado por área para MultiPolygon) — aquí solo se combinan las partes de
 * TODOS los WKT del grupo en un único MultiPolygon antes de llamar a esa
 * misma función, en vez de promediar centroides ya calculados por separado
 * (evita perder la ponderación real por área de cada recinto).
 */
import { parseWKT } from "./wktToGeoJSON.js";
import { centroide } from "./geometria.js";

/**
 * @param {Array<{ geometriaWkt?: string|null, ref?: string }>} filasOrigen
 * @returns {{ lon: number, lat: number, wktsUsados: number, wktsFallidos: Array<{ref:string, error:string}> }}
 * @throws si NINGÚN WKT del grupo es parseable (no hay ningún punto que calcular)
 */
export function centroideDeGrupo(filasOrigen) {
  const partes = [];
  const fallidos = [];

  for (const f of filasOrigen ?? []) {
    if (!f.geometriaWkt) continue;
    try {
      const geom = parseWKT(f.geometriaWkt);
      if (geom.type === "Polygon") partes.push(geom.coordinates);
      else if (geom.type === "MultiPolygon") partes.push(...geom.coordinates);
    } catch (err) {
      fallidos.push({ ref: f.ref ?? "(sin ref)", error: err.message });
    }
  }

  if (partes.length === 0) {
    throw new Error(
      `centroideDeGrupo(): ninguna "Geometría" del grupo se pudo interpretar como WKT válido` +
        (fallidos.length ? ` (${fallidos.length} fila/s con error: ${fallidos.map((f) => f.ref).join(", ")})` : " (grupo sin ninguna geometría declarada)"),
    );
  }

  const { lon, lat } = centroide({ type: "MultiPolygon", coordinates: partes });
  return { lon, lat, wktsUsados: partes.length, wktsFallidos: fallidos };
}
