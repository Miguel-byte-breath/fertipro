/**
 * api/sigpac.js — punto de entrada único de los proxies SIGPAC
 *
 * Consolidación (3-sep-2026): antes había 5 ficheros físicos en api/
 * (sigpac.js, sigpac-bbox.js, sigpac-mvt.js, sigpac-recinfo.js, sigpac-zvn.js),
 * y Vercel crea una función serverless por cada fichero de api/ — con las 3
 * nuevas del hilo Sativum (:calculate-npk, :group-crop-units, :export-report)
 * más api/mcp.js, se superó el límite de 12 funciones del plan Hobby y los
 * despliegues empezaron a fallar (confirmado contra la documentación oficial
 * de Vercel: "For Hobby, this approach is limited to 12 Vercel Functions per
 * deployment" — https://vercel.com/docs/functions/runtimes).
 *
 * Solución: los 5 proxies siguen siendo exactamente los mismos ficheros, con
 * la misma lógica, sin tocar ni una línea — solo se han movido a lib/sigpac/
 * (point.js, bbox.js, mvt.js, recinfo.js, zvn.js) para que dejen de contar
 * como funciones independientes, y este fichero (el único que queda en api/)
 * los invoca directamente pasándoles el req/res real, sin ninguna
 * transformación. Las URLs públicas NO cambian para el frontend:
 * /api/sigpac-bbox, /api/sigpac-mvt, /api/sigpac-recinfo y /api/sigpac-zvn
 * se reescriben en vercel.json hacia /api/sigpac?__action=<nombre>,
 * conservando intactos los query params originales (west/south/east/north,
 * z/x/y, pr/mu/po/pa/re/ag/zo, etc.) — la ruta directa /api/sigpac (punto
 * lon/lat) no necesita rewrite, ya apunta aquí, y es el comportamiento por
 * defecto cuando no hay __action.
 */

import point from '../lib/sigpac/point.js'
import bbox from '../lib/sigpac/bbox.js'
import mvt from '../lib/sigpac/mvt.js'
import recinfo from '../lib/sigpac/recinfo.js'
import zvn from '../lib/sigpac/zvn.js'

const HANDLERS = { point, bbox, mvt, recinfo, zvn }

export default async function handler(req, res) {
  const accion = req.query?.__action
  const target = HANDLERS[accion] || point
  return target(req, res)
}
