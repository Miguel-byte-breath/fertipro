/**
 * src/api/sativum-http.js — llamada HTTP de bajo nivel a Sativum, compartida
 *
 * Extrae SOLO el mecanismo puro (apikey + fetch + timeout/abort) que
 * `api/sativum-algo.js` y `api/sativum-plan.js` duplicaban byte a byte.
 * Deliberadamente NO decide forma de respuesta ni de error: cada caller
 * tiene su propio contrato (api/sativum-algo.js es un proxy OAS ya en
 * producción; api/sativum-plan.js hace su propio parseo defensivo del
 * HTML de error de Django) y ese contrato es suyo, no de este helper —
 * ver la corrección de Miguel (2-sep-2026): no se puede invocar el
 * handler de api/sativum-algo.js como función interna porque eso
 * rompería su propio contrato OAS, pensado para invocarse por HTTP.
 *
 * Devuelve siempre { status, ok, raw } (raw = upstream.text(), sin
 * parsear) o lanza un Error con .code para los fallos de transporte
 * (no configurado / timeout / conexión) — la interpretación de
 * "upstream respondió pero con error" queda para cada caller, porque
 * cada uno la muestra de forma distinta a su propio consumidor.
 */

export const SATIVUM_DEFAULT_BASE_URL = 'https://gateway.api.itacyl.es/sativum'

export async function postSativumAlgo(payload, { timeoutMs = 15000 } = {}) {
  const apikey = process.env.SATIVUM_API_KEY
  const baseUrl = (process.env.SATIVUM_BASE_URL || SATIVUM_DEFAULT_BASE_URL).replace(/\/$/, '')

  if (!apikey) {
    const err = new Error('SATIVUM_API_KEY no configurada en el entorno.')
    err.code = 'SATIVUM_NOT_CONFIGURED'
    throw err
  }

  // La barra final es obligatoria — el gateway rechaza sin ella.
  const url = `${baseUrl}/fertilicalc/algo/`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  let upstream
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (e) {
    const err = new Error(
      e.name === 'AbortError' ? 'Timeout conectando con Sativum.' : `Error conectando con Sativum: ${e.message}`
    )
    err.code = e.name === 'AbortError' ? 'SATIVUM_TIMEOUT' : 'SATIVUM_CONNECTION_ERROR'
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  // ⚠️ El upstream devuelve Content-Type: text/html aunque el body sea
  // JSON válido, incluso en éxito — cada caller decide cómo parsear/
  // interpretar `raw`, este helper no toca su contenido.
  const raw = await upstream.text()
  return { status: upstream.status, ok: upstream.ok, raw }
}
