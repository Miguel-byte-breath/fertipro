/**
 * src/utils/sigpac.js
 * Dado un punto {lon, lat}, devuelve el recinto SIGPAC más cercano.
 *
 * Respuesta normalizada:
 * {
 *   provincia: string,
 *   municipio: string,        // nombre + código numérico
 *   municipio_cod: number,
 *   poligono: number,
 *   parcela: number,
 *   recinto: number,
 *   uso_sigpac: string,       // "TA", "VI", "OL", etc.
 *   pendiente_media: number,  // %
 *   altitud: number,          // m
 *   superficie_ha: number,
 *   geometry: GeoJSON geometry
 * }
 */
export async function getSigpacRecinto(lon, lat) {
  const res = await fetch(`/api/sigpac?lon=${lon}&lat=${lat}`)

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error SIGPAC: ${res.status}`)
  }

  const data = await res.json()

  if (!data.features || data.features.length === 0) {
    return null  // punto fuera de recintos SIGPAC
  }

  // Tomamos el primer feature (bbox mínimo → suele ser único)
  const f = data.features[0]
  const p = f.properties

  return {
    provincia: p.provincia ?? null,
    municipio: p.municipio ?? null,
    municipio_cod: Number(p.municipio) || null,
    agregado: p.agregado != null ? Number(p.agregado) : 0,
    zona: p.zona != null ? Number(p.zona) : 0,
    poligono: Number(p.poligono) || null,
    parcela: Number(p.parcela) || null,
    recinto: Number(p.recinto) || null,
    // La API HubCloud puede devolver el uso como 'uso', 'uso_sigpac' o 'cod_uso'
    uso_sigpac: p.uso ?? p.uso_sigpac ?? p.cod_uso ?? null,
    pendiente_media: p.pendiente_media != null ? Number(p.pendiente_media) : null,
    altitud: p.altitud != null ? Number(p.altitud) : null,
    superficie_ha: p.superficie_ha != null ? Number(p.superficie_ha) : null,
    geometry: f.geometry ?? null,
    // raw por si se necesita en el futuro
    _raw: p,
  }
}
