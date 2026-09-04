/**
 * api/sativum-arcgis-npk.js — :estimate-soil-water-arcgis
 *
 * NO es un endpoint de negocio nuevo: reutiliza tal cual identificarSativum()
 * (extraída de api/sativum-suelo.js, mismo identify que ya usa producción, sin
 * cambiar su comportamiento externo) y normalizarSuelo() (src/api/sativum-suelo.js,
 * la misma normalización que ya usa la web). Lo único que añade este fichero es
 * el remapeo a los nombres arcgis* que resolverSueloAnalitica()/resolverAguaRiego()
 * de api/sativum-plan.js ya saben leer -- así el agente puede copiar `arcgisFields`
 * directamente en el payload de calculate_npk, sin traducir nombres a mano.
 *
 * Diseño confirmado con Miguel 4-sep-2026 (ver project_fertipro_mcp_visual_endpoint.md,
 * Paso 2 del cierre post-test real):
 *   - ArcGIS es SIEMPRE un rescate, nunca la vía primaria -- el agente debe
 *     preguntar primero por analítica real y solo llamar a esta tool si falta.
 *   - soilType NO tiene campo `arcgis*` de rescate dentro de calculate_npk (a
 *     diferencia de pOlsen/kSoil/organicMatter/ph): si no hay soilType manual,
 *     el agente debe asignar el `soilType` que devuelve esta tool DIRECTAMENTE
 *     en soil.soilType, no como campo de rescate.
 *   - arcgisNo3MgL/arcgisKMgL se pueden copiar siempre que existan: calculate_npk
 *     ya los ignora internamente si water.sourceType no es 'SUBTERRANEA' -- el
 *     agente no tiene que decidir eso.
 *   - Nunca se inventa un valor de rescate: si ArcGIS no clasifica el punto
 *     (agua, urbano, hueco de la interpolación kriging), el campo llega `null`
 *     y se avisa explícitamente en `warnings`.
 *
 * Entrada (POST body, vía invocarHandler en api/mcp.js): { lon, lat, tolerance? }
 * Salida: { soilType, soilTypeUsdaLabel, organicMatter, ph, pOlsen, kSoil,
 *           kIrrigation, no3Irrigation, arcgisFields:{soil,water}, warnings[] }
 */

import { identificarSativum } from './sativum-suelo.js'
import { normalizarSuelo } from '../src/api/sativum-suelo.js'

export default async function handler(req, res) {
  const { lon, lat, tolerance } = req.body || {}

  if (lon == null || lat == null) {
    return res.status(400).json({ error: 'Parámetros `lon` y `lat` requeridos' })
  }

  const lonF = Number(lon)
  const latF = Number(lat)
  if (isNaN(lonF) || isNaN(latF)) {
    return res.status(400).json({ error: 'lon/lat deben ser números' })
  }

  const result = await identificarSativum(lonF, latF, tolerance != null ? { tolerance } : {})

  if (!result.ok) {
    return res.status(result.status).json(result.error)
  }

  const suelo = normalizarSuelo(result.data)
  const warnings = []
  if (!suelo) {
    warnings.push('ArcGIS no devolvió resultados para este punto (fuera de cobertura del raster Sativum).')
  } else if (suelo.soilType == null) {
    warnings.push('ArcGIS no clasifica la textura de suelo en este punto (agua, urbano, o hueco de la interpolación) -- soilType queda sin resolver, hace falta analítica real.')
  }

  return res.status(200).json({
    soilType: suelo?.soilType ?? null,
    soilTypeUsdaLabel: suelo?.soilTypeUsdaLabel ?? null,
    organicMatter: suelo?.organicMatter ?? null,
    ph: suelo?.ph ?? null,
    pOlsen: suelo?.pOlsen ?? null,
    kSoil: suelo?.kSoil ?? null,
    kIrrigation: suelo?.kIrrigation ?? null,
    no3Irrigation: suelo?.no3Irrigation ?? null,
    arcgisFields: {
      soil: {
        arcgisPOlsen: suelo?.pOlsen ?? null,
        arcgisKSoil: suelo?.kSoil ?? null,
        arcgisOrganicMatter: suelo?.organicMatter ?? null,
        arcgisPh: suelo?.ph ?? null,
      },
      water: {
        arcgisNo3MgL: suelo?.no3Irrigation ?? null,
        arcgisKMgL: suelo?.kIrrigation ?? null,
      },
    },
    warnings,
  })
}
