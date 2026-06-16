import turfCentroid from '@turf/center-of-mass'
import turfArea from '@turf/area'

/**
 * src/utils/geometry.js — FertiPRO
 *
 * Utilidades de geometría:
 *   - centroide()        → {lat, lon} del anillo exterior
 *   - exportarGeoJSON()  → descarga FeatureCollection como .geojson
 *   - exportarSHP()      → descarga ZIP con .shp + .dbf + .shx + .prj (EPSG:4326)
 */

// ─── Centroide ────────────────────────────────────────────────────────────────

// Ray-cast multi-anillo. Maneja Polygon simple, Polygon con agujero real,
// Polygon multipart mal codificado (anillos disjuntos en lugar de MultiPolygon,
// salida típica de muchos parsers shapefile) y MultiPolygon. Por paridad de
// cruces se resuelven los cuatro casos sin código especial.
function _ptInGeom(pt, geom) {
  if (!geom) return false
  const [x, y] = pt
  let parts
  if (geom.type === 'Polygon')           parts = [geom.coordinates]
  else if (geom.type === 'MultiPolygon') parts = geom.coordinates
  else return false
  for (const rings of parts) {
    let inside = false
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
    }
    if (inside) return true
  }
  return false
}

// Extrae las "partes" reales de una geometría. Distingue entre Polygon con
// agujero real (anillos interiores contenidos en el exterior) y Polygon mal
// codificado por el parser shapefile como anillos disjuntos (la "segunda
// parte" no está dentro de la primera).
//   Polygon 1 anillo                → [coords]
//   Polygon con hole real           → [coords] (outer + hole queda como 1 parte)
//   Polygon con anillos disjuntos   → [[ring0], [ring1], ...] (N partes)
//   MultiPolygon                    → coords tal cual
function _extraerPartes(geom) {
  if (!geom) return []
  if (geom.type === 'MultiPolygon') return geom.coordinates
  if (geom.type !== 'Polygon')      return []
  const coords = geom.coordinates
  if (!coords?.length) return []
  if (coords.length === 1) return [coords]
  const outerGeom = { type: 'Polygon', coordinates: [coords[0]] }
  const parteCero = [coords[0]]
  const disjuntas = []
  for (let i = 1; i < coords.length; i++) {
    const ring = coords[i]
    if (!ring?.length) continue
    const testPt = ring[Math.floor(ring.length / 2)]
    if (_ptInGeom(testPt, outerGeom)) parteCero.push(ring)
    else                              disjuntas.push([ring])
  }
  return [parteCero, ...disjuntas]
}

/**
 * Calcula un punto representativo dentro de un GeoJSON Feature, garantizando
 * que el punto cae DENTRO de la geometría (asegura que la consulta SigPac
 * devuelva un recinto coherente con la parcela).
 *
 * Estrategia híbrida en tres pasos:
 *  1. Centroide global con @turf/center-of-mass.
 *  2. Si el punto cae FUERA (caso multipart, ya sea MultiPolygon con varias
 *     partes o Polygon mal codificado con anillos disjuntos), fallback a la
 *     parte de mayor área.
 *  3. Último recurso: media aritmética del primer anillo.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {{ lat: number, lon: number }}
 */
export function centroide(feature) {
  if (!feature?.geometry) return { lat: 0, lon: 0 }
  const geom = feature.geometry

  // 1) Centroide global
  try {
    const cGlobal = turfCentroid(feature).geometry.coordinates
    if (_ptInGeom(cGlobal, geom)) {
      return { lon: cGlobal[0], lat: cGlobal[1] }
    }
  } catch { /* sigue al fallback */ }

  // 2) Fallback: parte de mayor área (cubre MultiPolygon disjunto y Polygon
  // con anillos disjuntos del parser shapefile)
  const partes = _extraerPartes(geom)
  if (partes.length >= 2) {
    let bestSub = null, bestArea = -1
    for (const parte of partes) {
      try {
        const sub = { type: 'Feature', geometry: { type: 'Polygon', coordinates: parte }, properties: {} }
        const a = turfArea(sub)
        if (a > bestArea) { bestArea = a; bestSub = sub }
      } catch { /* parte inválida, saltar */ }
    }
    if (bestSub) {
      try {
        const c = turfCentroid(bestSub).geometry.coordinates
        return { lon: c[0], lat: c[1] }
      } catch { /* sigue al último recurso */ }
    }
  }

  // 3) Último recurso: media aritmética del primer anillo
  const ring = geom.type === 'MultiPolygon'
    ? geom.coordinates[0]?.[0]
    : geom.coordinates?.[0]
  if (ring?.length) {
    let lon = 0, lat = 0
    for (const c of ring) { lon += c[0]; lat += c[1] }
    return { lon: lon / ring.length, lat: lat / ring.length }
  }
  return { lat: 0, lon: 0 }
}

/**
 * Devuelve un array con un punto representativo (interior) por cada parte de
 * una parcela multipart. Reconoce dos formas de codificación:
 *   - MultiPolygon con dos o más sub-polígonos.
 *   - Polygon con anillos disjuntos (codificación del parser shapefile
 *     casero — anillos que NO están contenidos en el exterior).
 *
 * Para Polygon simple o MultiPolygon de una sola parte, devuelve []
 * (no hay nada que marcar como complemento al centroide principal).
 *
 * Útil para visualizar en el mapa todos los trozos de una parcela multipart
 * con marcadores secundarios, además del label principal. Mirror del patrón
 * de fertipro-zonas-normativas/utils/geometry.js.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {Array<{ lat: number, lon: number }>}
 */
export function centroidesPorParte(feature) {
  if (!feature?.geometry) return []
  const partes = _extraerPartes(feature.geometry)
  if (partes.length < 2) return []
  const result = []
  for (const parte of partes) {
    try {
      const sub = { type: 'Feature', geometry: { type: 'Polygon', coordinates: parte }, properties: {} }
      const c   = turfCentroid(sub).geometry.coordinates
      result.push({ lon: c[0], lat: c[1] })
    } catch {
      /* parte inválida, saltar */
    }
  }
  return result
}

/**
 * Nombre de parcela por defecto.
 */
export function generarNombreParcela(n) {
  return `Parcela ${n}`
}

// ─── Exportar GeoJSON ─────────────────────────────────────────────────────────

/**
 * Descarga un array de GeoJSON Features como archivo .geojson (FeatureCollection).
 * @param {GeoJSON.Feature[]} features
 * @param {string} filename  — sin extensión
 */
export function exportarGeoJSON(features, filename = 'fertipro_parcelas') {
  const fc   = { type: 'FeatureCollection', features }
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
  _download(blob, `${filename}.geojson`)
}

// ─── Exportar Shapefile ───────────────────────────────────────────────────────

/**
 * Genera y descarga un ZIP con los ficheros ESRI Shapefile:
 *   <filename>.shp  — geometrías (Polygon, tipo 5)
 *   <filename>.dbf  — atributos (id N10, nombre C50)
 *   <filename>.shx  — índice de registros
 *   <filename>.prj  — sistema de referencia EPSG:4326
 *   README.txt
 *
 * @param {GeoJSON.Feature[]} features  — cada feature debe tener .properties.id y .properties.nombre
 * @param {string} filename             — sin extensión
 */
export async function exportarSHP(features, filename = 'fertipro_parcelas') {
  const { default: JSZip } = await import('jszip')

  // Pre-calcular metadatos de cada feature (rings, nParts, nPoints, longitud de contenido)
  const records = features.map(f => {
    const geom  = f.geometry
    const rings = geom.type === 'MultiPolygon'
      ? geom.coordinates.flatMap(poly => poly)
      : geom.coordinates
    const nParts        = rings.length
    const nPoints       = rings.reduce((s, r) => s + r.length, 0)
    // Bytes del contenido del registro SHP (sin la cabecera de 8 bytes)
    const contentByteLen = 4 + 32 + 4 + 4 + nParts * 4 + nPoints * 16
    return { rings, nParts, nPoints, contentByteLen }
  })

  const shpBuf = _writeShp(records)
  const shxBuf = _writeShx(records)
  const dbfBuf = _writeDbf(features)
  const prj    = 'GEOGCS["GCS_WGS_1984",' +
    'DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
    'PRIMEM["Greenwich",0.0],' +
    'UNIT["Degree",0.0174532925199433]]'

  const zip = new JSZip()
  zip.file(`${filename}.shp`, shpBuf)
  zip.file(`${filename}.dbf`, dbfBuf)
  zip.file(`${filename}.shx`, shxBuf)
  zip.file(`${filename}.prj`, prj)
  zip.file('README.txt', [
    'Shapefile generado por FertiPRO',
    `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
    'CRS: EPSG:4326 (WGS 84)',
    '',
    'Campos DBF:',
    '  id      (N,10) — identificador interno de parcela',
    '  nombre  (C,50) — nombre de la parcela',
    '',
    'Compatible con QGIS, ArcGIS y cualquier GIS con soporte Shapefile.',
  ].join('\n'))

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  _download(blob, `${filename}.zip`)
}

// ─── Escritor binario SHP ─────────────────────────────────────────────────────

function _writeShp(records) {
  // Bounding box global
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  records.forEach(r => r.rings.forEach(ring => ring.forEach(([x, y]) => {
    if (x < xmin) xmin = x; if (x > xmax) xmax = x
    if (y < ymin) ymin = y; if (y > ymax) ymax = y
  })))
  if (!isFinite(xmin)) { xmin = ymin = xmax = ymax = 0 }

  const fileBytLen = 100 + records.reduce((s, r) => s + 8 + r.contentByteLen, 0)
  const buf = new ArrayBuffer(fileBytLen)
  const v   = new DataView(buf)

  // Cabecera de fichero (100 bytes)
  v.setInt32(0,  9994,             false) // file code
  v.setInt32(24, fileBytLen / 2,   false) // file length en palabras de 16 bits
  v.setInt32(28, 1000,             true)  // version
  v.setInt32(32, 5,                true)  // shape type: Polygon
  v.setFloat64(36, xmin,           true); v.setFloat64(44, ymin, true)
  v.setFloat64(52, xmax,           true); v.setFloat64(60, ymax, true)
  // Zmin, Zmax, Mmin, Mmax → quedan a 0 (ArrayBuffer inicializado a 0)

  let off = 100
  records.forEach((r, i) => {
    // Bounding box del registro
    let rxmin = Infinity, rymin = Infinity, rxmax = -Infinity, rymax = -Infinity
    r.rings.forEach(ring => ring.forEach(([x, y]) => {
      if (x < rxmin) rxmin = x; if (x > rxmax) rxmax = x
      if (y < rymin) rymin = y; if (y > rymax) rymax = y
    }))

    // Cabecera del registro (8 bytes)
    v.setInt32(off,     i + 1,                  false) // nº de registro (base 1, big-endian)
    v.setInt32(off + 4, r.contentByteLen / 2,   false) // longitud contenido en palabras
    off += 8

    // Contenido del registro
    v.setInt32(off, 5, true); off += 4  // shape type

    v.setFloat64(off,      rxmin, true)  // bbox del registro
    v.setFloat64(off + 8,  rymin, true)
    v.setFloat64(off + 16, rxmax, true)
    v.setFloat64(off + 24, rymax, true)
    off += 32

    v.setInt32(off, r.nParts,  true); off += 4  // num parts
    v.setInt32(off, r.nPoints, true); off += 4  // num points

    // Array de índices de inicio de cada anillo
    let ptIdx = 0
    r.rings.forEach(ring => {
      v.setInt32(off, ptIdx, true); off += 4
      ptIdx += ring.length
    })

    // Array de puntos (X,Y como float64 little-endian)
    r.rings.forEach(ring => {
      ring.forEach(([x, y]) => {
        v.setFloat64(off,     x, true)
        v.setFloat64(off + 8, y, true)
        off += 16
      })
    })
  })

  return buf
}

// ─── Escritor binario SHX ─────────────────────────────────────────────────────

function _writeShx(records) {
  const fileBytLen = 100 + records.length * 8
  const buf = new ArrayBuffer(fileBytLen)
  const v   = new DataView(buf)

  v.setInt32(0,  9994,             false)
  v.setInt32(24, fileBytLen / 2,   false)
  v.setInt32(28, 1000,             true)
  v.setInt32(32, 5,                true)

  let off    = 100
  let shpOff = 100  // offset en bytes en el fichero SHP
  records.forEach(r => {
    v.setInt32(off,     shpOff / 2,           false) // offset en palabras (big-endian)
    v.setInt32(off + 4, r.contentByteLen / 2, false) // longitud contenido en palabras
    off    += 8
    shpOff += 8 + r.contentByteLen
  })

  return buf
}

// ─── Escritor binario DBF ─────────────────────────────────────────────────────

function _writeDbf(features) {
  const fields = [
    { name: 'id',     type: 'N', len: 10 },
    { name: 'nombre', type: 'C', len: 50 },
  ]

  const n          = features.length
  const headerSize = 32 + fields.length * 32 + 1  // 32 (cabecera) + descriptores + terminador
  const recordSize = 1 + fields.reduce((s, f) => s + f.len, 0)  // 1 (flag) + campos
  const buf        = new ArrayBuffer(headerSize + n * recordSize)
  const v          = new DataView(buf)
  const bytes      = new Uint8Array(buf)
  const enc        = new TextEncoder()

  // Cabecera del fichero
  const now = new Date()
  bytes[0] = 3                              // dBASE III
  bytes[1] = now.getFullYear() - 1900       // año (desde 1900)
  bytes[2] = now.getMonth() + 1            // mes
  bytes[3] = now.getDate()                 // día
  v.setInt32(4,  n,          true)          // número de registros
  v.setInt16(8,  headerSize, true)          // tamaño de cabecera en bytes
  v.setInt16(10, recordSize, true)          // tamaño de registro en bytes

  // Descriptores de campo (32 bytes cada uno)
  let foff = 32
  fields.forEach(f => {
    const nameBytes = enc.encode(f.name)
    for (let i = 0; i < Math.min(nameBytes.length, 11); i++) {
      bytes[foff + i] = nameBytes[i]
    }
    bytes[foff + 11] = f.type.charCodeAt(0)  // tipo de campo
    bytes[foff + 16] = f.len                  // longitud del campo
    foff += 32
  })
  bytes[foff] = 0x0D  // terminador de cabecera

  // Registros
  let roff = headerSize
  features.forEach((feat, i) => {
    const props = feat.properties || {}
    bytes[roff] = 0x20  // flag: registro activo (no borrado)
    roff += 1

    fields.forEach(f => {
      let val = ''
      if (f.name === 'id')     val = String(props.id     ?? i + 1)
      if (f.name === 'nombre') val = String(props.nombre ?? `Parcela ${i + 1}`)
      _writeDbfField(bytes, enc, roff, val, f.len, f.type)
      roff += f.len
    })
  })

  return buf
}

/**
 * Escribe un valor de campo DBF:
 *   - tipo 'N': alineado a la derecha, relleno con espacios a la izquierda
 *   - tipo 'C': alineado a la izquierda, relleno con espacios a la derecha
 */
function _writeDbfField(bytes, enc, off, val, len, type) {
  const encoded = enc.encode(String(val).slice(0, len))
  if (type === 'N') {
    const pad = len - encoded.length
    for (let i = 0; i < len; i++) {
      bytes[off + i] = i < pad ? 0x20 : encoded[i - pad]
    }
  } else {
    for (let i = 0; i < len; i++) {
      bytes[off + i] = i < encoded.length ? encoded[i] : 0x20
    }
  }
}

// ─── Helper: trigger de descarga ─────────────────────────────────────────────

function _download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
