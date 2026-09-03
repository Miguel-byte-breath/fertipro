/**
 * api/sigpac-zvn.js
 *
 * Proxy para el servicio de intersección de nitratos de SIGPAC (FEGA).
 * Comprueba si un recinto intersecta alguna Zona Vulnerable a Nitratos (ZVN)
 * según el RD 1051/2022.
 *
 * GET /api/sigpac-zvn?pr=X&mu=X&po=X&pa=X&re=X[&ag=X&zo=X]
 *
 * Endpoint upstream:
 * https://sigpac-hubcloud.es/servicioconsultassigpac/intersection/nitratos/pr/mu/ag/zo/po/pa/re.json
 *
 * Respuesta upstream:
 *   [{ surface_intersection: <m²>, surface_tpc: <float 0-100> }]  → hay ZVN
 *   []                                                             → no hay ZVN
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura)
 */

const ZVN_TIMEOUT_MS = 5000

export default async function handler(req, res) {
  const { pr, mu, po, pa, re, ag = '0', zo = '0' } = req.query

  if (!pr || !mu || !po || !pa || !re) {
    return res.status(400).json({ error: 'Parámetros pr, mu, po, pa, re requeridos' })
  }

  const url =
    `https://sigpac-hubcloud.es/servicioconsultassigpac/intersection/nitratos` +
    `/${pr}/${mu}/${ag}/${zo}/${po}/${pa}/${re}.json`

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), ZVN_TIMEOUT_MS)

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `SIGPAC ZVN ${upstream.status}` })
    }

    const data = await upstream.json()

    // Cache agresivo: las ZVN cambian con los programas de acción (ciclos anuales)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    // Devolvemos el array tal cual: [] = sin ZVN, [{...}] = en ZVN
    return res.status(200).json(Array.isArray(data) ? data : [])
  } catch (err) {
    clearTimeout(timeoutId)
    return res.status(502).json({
      error:  'Error conectando con SIGPAC ZVN',
      detail: err.message,
    })
  }
}
