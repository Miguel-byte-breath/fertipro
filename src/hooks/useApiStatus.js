/**
 * src/hooks/useApiStatus.js
 *
 * Healthcheck silencioso al montar la app para Sativum y SIGPAC.
 * Un único intento + un reintento a los 2 s (los 502 de SIGPAC son transitorios).
 * No bloquea el arranque; no hace polling.
 *
 * @returns {{ sativum: 'checking'|'ok'|'down', sigpac: 'checking'|'ok'|'down' }}
 */
import { useEffect, useState } from 'react'

const SATIVUM_URL  = '/api/sativum-crops?name=Patata'   // filtrado → respuesta ligera
const SIGPAC_URL   = '/api/sigpac-recinfo?pr=47&mu=186&po=1&pa=1&re=1'
const TIMEOUT_MS   = 5000
const RETRY_DELAY  = 2000

async function checkOnce(url) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.status < 500 ? 'ok' : 'down'   // 4xx = vivo; 5xx = problema
  } catch {
    return 'down'
  } finally {
    clearTimeout(t)
  }
}

async function checkWithRetry(url) {
  const first = await checkOnce(url)
  if (first === 'ok') return 'ok'
  await new Promise(r => setTimeout(r, RETRY_DELAY))
  return checkOnce(url)
}

export function useApiStatus() {
  const [status, setStatus] = useState({ sativum: 'checking', sigpac: 'checking' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      checkWithRetry(SATIVUM_URL),
      checkWithRetry(SIGPAC_URL),
    ]).then(([sativum, sigpac]) => {
      if (!cancelled) setStatus({ sativum, sigpac })
    })
    return () => { cancelled = true }
  }, [])

  return status
}
