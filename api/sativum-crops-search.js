/**
 * api/sativum-crops-search.js — :search-crop
 *
 * NO es un endpoint de negocio nuevo: reutiliza tal cual buscarCultivosSativum()
 * (extraída de api/sativum-crops.js, mismo filtro name/group que ya usa la web,
 * sin cambiar su comportamiento externo). Devuelve el objeto de catálogo Sativum
 * TAL CUAL — es exactamente lo que calculate_npk necesita recibir en
 * currentCrop.crop / precedingCrop.crop, sin que el agente tenga que pegar el
 * JSON del catálogo a mano.
 *
 * Entrada (POST body, vía invocarHandler en api/mcp.js): { name?, group? }
 * Salida: array de cultivos Sativum (mismo shape que /nutrients/crops), ya
 * filtrado si se dieron name/group. Si se omiten ambos, devuelve el catálogo
 * completo (150+ cultivos) — el agente debería acotar por name en la práctica.
 */

import { buscarCultivosSativum } from './sativum-crops.js'

export default async function handler(req, res) {
  const { name, group } = req.body || {}

  const result = await buscarCultivosSativum({ name, group })

  if (!result.ok) {
    return res.status(result.status).json(result.error)
  }

  return res.status(200).json(result.data)
}
