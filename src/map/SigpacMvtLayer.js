/**
 * src/map/SigpacMvtLayer.js — capa Leaflet vectorial de recintos SIGPAC.
 *
 * Extiende `L.GridLayer` para descargar teselas en formato MVT GeoJSON desde
 * SIGPAC HubCloud y renderizar cada recinto como un polígono vectorial. Es la
 * pareja interactiva del WMS ráster: el WMS da la guía visual continua a
 * cualquier zoom, y esta capa se activa por encima de `minZoom` (por defecto
 * 13) para tener geometrías reales en cliente.
 *
 * Endpoint upstream (a traves de /api/sigpac-mvt para evitar CORB):
 *   https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/{z}/{x}/{y}.geojson
 *
 * Cada feature trae al menos:
 *   { provincia, municipio, poligono, parcela, recinto, uso_sigpac }
 *
 * Opciones extra (paso 3 — modo selección):
 *   featureStyle (feature) => style   función opcional que devuelve el estilo
 *                                     de cada recinto. Útil para resaltar
 *                                     recintos seleccionados.
 *
 * Métodos públicos:
 *   redrawStyles()         reaplica featureStyle a todas las features
 *                          renderizadas (tras cambiar la selección).
 *   findFeatureAt(latlng)  devuelve la feature del recinto que contiene
 *                          `latlng`, o null si no hay ninguno bajo el punto.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura).
 */
import L from 'leaflet'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

// Proxy serverless propio para evitar CORB del navegador. Internamente
// hace fetch a sigpac-hubcloud (server-side, sin Referer cross-origin).
const TILE_URL = '/api/sigpac-mvt?z={z}&x={x}&y={y}'

const DEFAULT_OPTIONS = {
  minZoom:     13,
  maxZoom:     20,
  tileSize:    256,
  pane:        'overlayPane',
  // Estilo guía visual por defecto (cuando no hay featureStyle)
  color:       '#ff6f00',
  weight:      1.2,
  fillOpacity: 0,
  opacity:     0.85,
  interactive: false,  // los clics se gestionan en map.on('click') con turf
  attribution:
    '&copy; <a href="https://sigpac-hubcloud.es">SIGPAC FEGA</a> &middot; ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/deed.es">CC BY 4.0</a>',
}

export const SigpacMvtLayer = L.GridLayer.extend({
  initialize(options = {}) {
    L.setOptions(this, { ...DEFAULT_OPTIONS, ...options })
    // Mapa "tileKey -> L.featureGroup" para limpiar al hacer unload
    this._featureLayers = new Map()
  },

  onAdd(map) {
    L.GridLayer.prototype.onAdd.call(this, map)
    this.on('tileunload', this._onTileUnload, this)
  },

  onRemove(map) {
    this.off('tileunload', this._onTileUnload, this)
    this._featureLayers.forEach(group => {
      if (map.hasLayer(group)) map.removeLayer(group)
    })
    this._featureLayers.clear()
    L.GridLayer.prototype.onRemove.call(this, map)
  },

  /**
   * Devuelve el estilo aplicable a una feature: usa `featureStyle` si es una
   * funcion, en otro caso aplica el estilo por defecto de las options.
   */
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
    this._featureLayers.forEach(group => {
      group.eachLayer(geoJsonLayer => {
        if (typeof geoJsonLayer.eachLayer !== 'function') return
        geoJsonLayer.eachLayer(featureLayer => {
          const f = featureLayer.feature
          if (!f) return
          try {
            featureLayer.setStyle(this._styleForFeature(f))
          } catch (_) { /* ignore */ }
        })
      })
    })
  },

  createTile(coords, done) {
    const tile = document.createElement('div')
    tile.style.cssText = 'pointer-events:none;visibility:hidden;'

    const url = TILE_URL
      .replace('{z}', coords.z)
      .replace('{x}', coords.x)
      .replace('{y}', coords.y)

    const key = this._tileKey(coords)

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(geojson => {
        if (!geojson?.features?.length) {
          done(null, tile)
          return
        }

        const group = L.featureGroup()
        geojson.features.forEach(f => {
          const t = f.geometry?.type
          if (t !== 'Polygon' && t !== 'MultiPolygon') return

          const featLayer = L.geoJSON(f, {
            style: this._styleForFeature(f),
            interactive: this.options.interactive,
          })

          // Asegurar que cada sublayer tiene .feature accesible para findFeatureAt
          featLayer.eachLayer(sublayer => { sublayer.feature = f })

          featLayer.addTo(group)
        })

        if (this._map) {
          group.addTo(this._map)
          this._featureLayers.set(key, group)
        }
        done(null, tile)
      })
      .catch(err => {
        // Fallo silencioso: la capa no debe bloquear la UX. El WMS rastet
        // sigue dando la guia visual aunque el MVT falle puntualmente.
        // eslint-disable-next-line no-console
        console.warn('[SigpacMvtLayer] tesela', key, 'fallo:', err.message)
        done(null, tile)
      })

    return tile
  },

  /**
   * Devuelve la feature del recinto SIGPAC que contiene `latlng`, o null.
   * Recorre todas las teselas cargadas y aplica turf.booleanPointInPolygon
   * sobre cada feature. Coste O(n) sobre los recintos visibles, pero a
   * zoom 13+ son del orden de decenas, asi que es instantaneo.
   */
  findFeatureAt(latlng) {
    const point = { type: 'Point', coordinates: [latlng.lng, latlng.lat] }
    let totalFeatures = 0
    this._featureLayers.forEach(g => g.eachLayer(gl => gl.eachLayer && gl.eachLayer(() => totalFeatures++)))
    console.log('[findFeatureAt] tiles:', this._featureLayers.size, 'features:', totalFeatures, 'point:', latlng)
    let matched = null
    this._featureLayers.forEach(group => {
      if (matched) return
      group.eachLayer(geoJsonLayer => {
        if (matched || typeof geoJsonLayer.eachLayer !== 'function') return
        geoJsonLayer.eachLayer(featureLayer => {
          if (matched) return
          const f = featureLayer.feature
          if (!f) return
          try {
            if (booleanPointInPolygon(point, f)) matched = f
          } catch (_) { /* ignore */ }
        })
      })
    })
    return matched
  },

  _onTileUnload(e) {
    const key   = this._tileKey(e.coords)
    const group = this._featureLayers.get(key)
    if (group && this._map?.hasLayer(group)) {
      this._map.removeLayer(group)
    }
    this._featureLayers.delete(key)
  },

  _tileKey(coords) {
    return `${coords.z}/${coords.x}/${coords.y}`
  },
})

export function sigpacMvtLayer(options) {
  return new SigpacMvtLayer(options)
}
