/**
 * api/sigpac-recinfo.js
 *
 * Proxy para el servicio REST de consultas SIGPAC (FEGA).
 * Devuelve propiedades enriquecidas de un recinto: uso_sigpac, coef_regadio,
 * superficie, pendiente_media, admisibilidad, etc.
 *
 * GET /api/sigpac-recinfo?pr=X&mu=X&po=X&pa=X&re=X[&ag=X&zo=X]
 *
 * Endpoint upstream:
 * https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfo/pr/mu/ag/zo/po/pa/re.json
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura)
 */

const RECINFO_TIMEOUT_MS = 5000

export default async function handler(req, res) {
  const { pr, mu, po, pa, re, ag = '0', zo = '0' } = req.query

  if (!pr || !mu || !po || !pa || !re) {
    return res.status(400).json({ error: 'Parámetros pr, mu, po, pa, re requeridos' })
  }

  const url =
    `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfo` +
    `/${pr}/${mu}/${ag}/${zo}/${po}/${pa}/${re}.json`

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), RECINFO_TIMEOUT_MS)

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `SIGPAC recinfo ${upstream.status}` })
    }

    const data = await upstream.json()
    const rec  = Array.isArray(data) ? data[0] : data

    if (!rec) {
      return res.status(404).json({ error: 'Recinto no encontrado' })
    }

    // Cache agresivo: los datos SIGPAC cambian una vez al año
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({
      uso_sigpac:      rec.uso_sigpac      ?? null,
      coef_regadio:    rec.coef_regadio    ?? null,
      superficie:      rec.superficie      ?? null,
      pendiente_media: rec.pendiente_media ?? null,
      admisibilidad:   rec.admisibilidad   ?? null,
      region:          rec.region          ?? null,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    return res.status(502).json({
      error:  'Error conectando con SIGPAC recinfo',
      detail: err.message,
    })
  }
}
