/**
 * src/map/SigpacMvtLayer.js — capa Leaflet vectorial de recintos SIGPAC.
 *
 * Extiende `L.GridLayer` para descargar teselas en formato MVT GeoJSON desde
 * SIGPAC HubCloud y renderizar cada recinto como un polígono vectorial. Es la
 * pareja interactiva del WMS ráster: el WMS da la guía visual continua a
 * cualquier zoom, y esta capa se activa por encima de `minZoom` (por defecto
 * 13) para tener geometrías reales en cliente.
 *
 * En el paso 2 se renderizan únicamente como guía sutil (borde, sin relleno,
 * sin captura de clics). El modo selección de recintos se incorporará en el
 * paso 3 cambiando `interactive: true` y enganchando handlers de clic.
 *
 * Endpoint upstream:
 *   https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/{z}/{x}/{y}.geojson
 *
 * Cada feature trae al menos:
 *   { provincia, municipio, poligono, parcela, recinto, uso_sigpac }
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA — Ministerio de Agricultura).
 */
import L from 'leaflet'

const TILE_URL =
  'https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/{z}/{x}/{y}.geojson'

const DEFAULT_OPTIONS = {
  minZoom:     13,            // por debajo no se piden teselas (saturaría)
  maxZoom:     20,
  tileSize:    256,
  pane:        'overlayPane',
  // Estilo guía visual (paso 2: sutil, sin interacción)
  color:       '#ff6f00',
  weight:      1.2,
  fillOpacity: 0,
  opacity:     0.85,
  interactive: false,         // paso 3 lo pondrá a true para captar clics
  // Diagnóstico
  attribution:
    '© <a href="https://sigpac-hubcloud.es">SIGPAC FEGA</a> · ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/deed.es">CC BY 4.0</a>',
}

export const SigpacMvtLayer = L.GridLayer.extend({
  initialize(options = {}) {
    L.setOptions(this, { ...DEFAULT_OPTIONS, ...options })
    // Mapa "tileKey → L.featureGroup" para limpiar al hacer unload de la tesela
    this._featureLayers = new Map()
  },

  onAdd(map) {
    L.GridLayer.prototype.onAdd.call(this, map)
    this.on('tileunload', this._onTileUnload, this)
  },

  onRemove(map) {
    this.off('tileunload', this._onTileUnload, this)
    // Quitar todos los feature groups acumulados
    this._featureLayers.forEach(group => {
      if (map.hasLayer(group)) map.removeLayer(group)
    })
    this._featureLayers.clear()
    L.GridLayer.prototype.onRemove.call(this, map)
  },

  /**
   * Leaflet llama a `createTile` por cada tesela visible que esté dentro del
   * rango [minZoom, maxZoom]. Devolvemos un `<div>` invisible (la grid lo
   * necesita como placeholder), y en paralelo lanzamos el fetch del GeoJSON.
   * Cuando el GeoJSON llega, lo añadimos al mapa como feature group.
   */
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
          L.geoJSON(f, {
            style: {
              color:       this.options.color,
              weight:      this.options.weight,
              fillOpacity: this.options.fillOpacity,
              opacity:     this.options.opacity,
            },
            interactive: this.options.interactive,
          }).addTo(group)
        })

        if (this._map) {
          group.addTo(this._map)
          this._featureLayers.set(key, group)
        }
        done(null, tile)
      })
      .catch(err => {
        // Fallo silencioso: la capa no debe bloquear la UX. El usuario verá
        // que algunas teselas no tienen recintos pintados; el WMS ráster
        // sigue dando la guía visual.
        // eslint-disable-next-line no-console
        console.warn('[SigpacMvtLayer] tesela', key, 'falló:', err.message)
        done(null, tile)
      })

    return tile
  },

  /**
   * Cuando Leaflet descarta una tesela (zoom o pan fuera de vista), retiramos
   * su feature group del mapa para no acumular memoria.
   */
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

/**
 * Factory en minúsculas, siguiendo la convención de Leaflet (`L.tileLayer`,
 * `L.geoJSON`, etc.).
 */
export function sigpacMvtLayer(options) {
  return new SigpacMvtLayer(options)
}
