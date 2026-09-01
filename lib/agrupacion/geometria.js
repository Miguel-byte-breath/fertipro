// -*- coding: utf-8 -*-
/**
 * geometria.js — centroide aproximado de una geometría GeoJSON Polygon/
 * MultiPolygon, para poder pedir a ArcGIS "identify" un punto representativo
 * de la parcela (el servicio solo necesita un lon/lat dentro del recinto, no
 * el contorno completo). Centroide = media de vértices del anillo exterior
 * de cada parte, ponderada por el área de esa parte (mismo cálculo de área
 * geodésica que ya usa geoArea.js) — suficiente para parcelas agrícolas
 * razonablemente convexas, sin pretender ser un centroide planar exacto.
 */
import { area as areaM2 } from "./geoArea.js";

function centroideAnillo(anillo) {
  // Excluye el último punto si es igual al primero (anillo cerrado WKT).
  const pts =
    anillo.length > 1 &&
    anillo[0][0] === anillo[anillo.length - 1][0] &&
    anillo[0][1] === anillo[anillo.length - 1][1]
      ? anillo.slice(0, -1)
      : anillo;
  const n = pts.length;
  if (n === 0) return null;
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of pts) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / n, sumLat / n];
}

/**
 * @param {object} geometria - GeoJSON Polygon o MultiPolygon
 * @returns {{ lon: number, lat: number }}
 */
export function centroide(geometria) {
  if (!geometria || !geometria.type) throw new Error("centroide(): geometría GeoJSON no válida");

  if (geometria.type === "Polygon") {
    const [lon, lat] = centroideAnillo(geometria.coordinates[0]);
    return { lon, lat };
  }

  if (geometria.type === "MultiPolygon") {
    let sumLon = 0;
    let sumLat = 0;
    let pesoTotal = 0;
    for (const parte of geometria.coordinates) {
      const c = centroideAnillo(parte[0]);
      if (!c) continue;
      const peso = areaM2({ type: "Polygon", coordinates: parte }) || 1e-6; // nunca 0 exacto
      sumLon += c[0] * peso;
      sumLat += c[1] * peso;
      pesoTotal += peso;
    }
    if (pesoTotal === 0) throw new Error("centroide(): MultiPolygon sin partes válidas");
    return { lon: sumLon / pesoTotal, lat: sumLat / pesoTotal };
  }

  throw new Error(`centroide(): tipo de geometría no soportado: ${geometria.type}`);
}
