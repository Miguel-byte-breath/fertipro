/**
 * src/map/SigpacMvtLayer.js — capa Leaflet vectorial de recintos SIGPAC.
 *
 * Mantiene el nombre historico pero internamente NO usa teselas MVT (que
 * son inconsistentes en sigpac-hubcloud). Usa la OGC API de SIGPAC a traves
 * del proxy serverless `/api/sigpac-bbox`, que es fiable y ya esta probado.
 *
 * La capa extiende `L.LayerGroup` y escucha el evento `moveend` del mapa
 * para refrescar los recintos del bbox visible. Hay un guardarrail: el
 * endpoint /api/sigpac-bbox capa el bbox a ~5km^2, asi que solo se piden
 * recintos cuando el zoom es >= minZoom (por defecto 14, suficiente para
 * que el bbox quepa).
 *
 * Cada feature trae al menos:
 *   { provincia, municipio, poligono, parcela, recinto, uso_sigpac,
 *     pendiente_media, altitud, superficie_ha }
 *
 * Opciones extra:
 *   featureStyle (feature) => style   función opcional que devuelve el estilo
 *                                     de cada recinto. Útil para resaltar
 *                                     recintos seleccionados.
 *
 * Métodos públicos:
 *   redrawStyles()         reaplica featureStyle a todas las features.
 *   findFeatureAt(latlng)  devuelve la feature del recinto que contiene
 *                          `latlng`, o null si no hay ninguno.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura).
 */
import L from 'leaflet'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

// Proxy serverless propio que pega a la OGC API de SIGPAC HubCloud y
// devuelve los recintos enriquecidos con uso_sigpac.
const BBOX_URL = '/api/sigpac-bbox?west={w}&south={s}&east={e}&north={n}'

// El endpoint capa internamente el bbox a 0.05 grados. Dejamos un pequeno
// margen de seguridad por debajo para evitar rechazos cerca del limite.
const MAX_DELTA = 0.045

const DEFAULT_OPTIONS = {
  minZoom:     14,            // a zoom <14 el bbox no cabria en MAX_DELTA
  color:       '#ff6f00',
  weight:      1.2,
  fillOpacity: 0,
  opacity:     0.85,
  attribution:
    '&copy; <a href="https://sigpac-hubcloud.es">SIGPAC FEGA</a> &middot; ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/deed.es">CC BY 4.0</a>',
}

export const SigpacMvtLayer = L.LayerGroup.extend({
  initialize(options = {}) {
    L.Util.setOptions(this, { ...DEFAULT_OPTIONS, ...options })
    L.LayerGroup.prototype.initialize.call(this, [])
    this._features         = new Map()   // recintoKey -> feature
    this._featureLayers    = new Map()   // recintoKey -> L.GeoJSON
    this._lastBboxKey      = null
    this._abortController  = null
  },

  onAdd(map) {
    L.LayerGroup.prototype.onAdd.call(this, map)
    map.on('moveend', this._refresh, this)
    this._refresh()
  },

  onRemove(map) {
    map.off('moveend', this._refresh, this)
    this._abortController?.abort()
    this._abortController = null
    this.clearLayers()
    this._features.clear()
    this._featureLayers.clear()
    this._lastBboxKey = null
    L.LayerGroup.prototype.onRemove.call(this, map)
  },

  /**
   * Llamado en cada moveend: si el zoom es suficiente, calcula el bbox
   * visible y fetchea los recintos. Si el zoom es bajo, limpia la capa.
   */
  _refresh() {
    const map = this._map
    if (!map) return

    if (map.getZoom() < this.options.minZoom) {
      this._clearAll()
      return
    }

    const bounds = map.getBounds()
    let west  = bounds.getWest()
    let south = bounds.getSouth()
    let east  = bounds.getEast()
    let north = bounds.getNorth()

    // Capear el bbox a MAX_DELTA centrado en el centro del mapa.
    if ((east - west) > MAX_DELTA || (north - south) > MAX_DELTA) {
      const c    = map.getCenter()
      const half = MAX_DELTA / 2
      west  = c.lng - half
      east  = c.lng + half
      south = c.lat - half
      north = c.lat + half
    }

    const bboxKey = `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`
    if (bboxKey === this._lastBboxKey) return
    this._lastBboxKey = bboxKey

    this._abortController?.abort()
    this._abortController = new AbortController()

    const url = BBOX_URL
      .replace('{w}', west)
      .replace('{s}', south)
      .replace('{e}', east)
      .replace('{n}', north)

    fetch(url, { signal: this._abortController.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(geojson => {
        if (!geojson?.features) return
        this._renderFeatures(geojson.features)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        // eslint-disable-next-line no-console
        console.warn('[SigpacMvtLayer] bbox fetch fallo:', err.message)
      })
  },

  _renderFeatures(features) {
    const seen = new Set()
    features.forEach(f => {
      const t = f.geometry?.type
      if (t !== 'Polygon' && t !== 'MultiPolygon') return

      const key = this._featureKey(f.properties)
      seen.add(key)
      if (this._featureLayers.has(key)) {
        // Ya esta dibujado, solo refrescar feature (puede traer datos nuevos)
        this._features.set(key, f)
        return
      }

      const geoLayer = L.geoJSON(f, {
        style:       this._styleForFeature(f),
        interactive: false,
      })
      geoLayer.eachLayer(sub => { sub.feature = f })

      this._features.set(key, f)
      this._featureLayers.set(key, geoLayer)
      this.addLayer(geoLayer)
    })

    // Quitar recintos que ya no estan en el bbox visible
    for (const [key, geoLayer] of [...this._featureLayers.entries()]) {
      if (seen.has(key)) continue
      this.removeLayer(geoLayer)
      this._features.delete(key)
      this._featureLayers.delete(key)
    }
  },

  _clearAll() {
    this.clearLayers()
    this._features.clear()
    this._featureLayers.clear()
    this._lastBboxKey = null
  },

  _featureKey(p) {
    return `${p.provincia}-${p.municipio}-${p.poligono}-${p.parcela}-${p.recinto}`
  },

  _styleForFeature(feature) {
    if (typeof this.options.featureStyle === 'function') {
      const s = this.options.featureStyle(feature)
      if (s) return s
    }
    return {
      color:       this.options.color,
      weight:      this.options.weight,
      fillOpacity: this.options.fillOpacity,
      opacity:     this.options.opacity,
    }
  },

  /**
   * Recorre todas las features renderizadas y reaplica su estilo. Se llama
   * desde fuera tras cambiar la seleccion para reflejar visualmente los
   * recintos elegidos.
   */
  redrawStyles() {
    this._featureLayers.forEach(geoLayer => {
      geoLayer.eachLayer(featureLayer => {
        const f = featureLayer.feature
        if (!f) return
        try {
          featureLayer.setStyle(this._styleForFeature(f))
        } catch (_) { /* ignore */ }
      })
    })
  },

  /**
   * Devuelve la feature del recinto SIGPAC que contiene `latlng`, o null.
   * Las features de la OGC API vienen en GeoJSON estandar (lat/lon, EPSG:4326)
   * asi que el punto se construye directo en ese sistema.
   */
  findFeatureAt(latlng) {
    const point = { type: 'Point', coordinates: [latlng.lng, latlng.lat] }
    for (const f of this._features.values()) {
      try {
        if (booleanPointInPolygon(point, f)) return f
      } catch (_) { /* ignore */ }
    }
    return null
  },
})

export function sigpacMvtLayer(options) {
  return new SigpacMvtLayer(options)
}
