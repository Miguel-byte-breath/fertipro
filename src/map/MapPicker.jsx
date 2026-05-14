/**
 * src/map/MapPicker.jsx — FertiPRO
 *
 * Mapa interactivo para selección de parcelas de cultivo.
 *
 * Capas base: OpenStreetMap / PNOA Máxima Actualidad (IGN)
 * Overlays:   Recintos SIGPAC (FEGA, CC BY 4.0)
 * Herramientas:
 *   - Geoman: dibujar / editar / eliminar polígonos
 *   - Carga de GeoJSON o Shapefile (ZIP con .shp + .dbf)
 *   - Geocoder Nominatim (búsqueda municipio / paraje)
 *   - Mi ubicación (geolocation API)
 *   - Escala métrica
 *
 * Props:
 *   onCoordSelect({lon, lat})         — clic en mapa fuera de polígonos (modo punto)
 *   selectedPoint                     — marcador activo {lon, lat} | null
 *   onPolygonAdd(feature, id)         — polígono añadido (dibujado o cargado)
 *   onPolygonRemove(id)               — polígono eliminado con herramienta Geoman
 *   onPolygonClick(id)                — clic sobre un polígono existente
 *   activePolygonId                   — id de la parcela resaltada | 'todas' | null
 *   isCentroid                        — true → marcador de centroide, false → pin
 *
 * Ref expuesta:
 *   removeLayerById(id)               — elimina la capa de un polígono desde el panel
 *
 * Adaptado de fertipro-zonas-normativas v0.4.5.
 */
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet/dist/leaflet.css'
import { sigpacMvtLayer } from './SigpacMvtLayer'
import area from '@turf/area'

// Iconos por defecto de Leaflet (los assets se sirven desde CDN para evitar
// problemas con el bundler resolviendo PNGs internos del paquete).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const MapPicker = forwardRef(function MapPicker(
  { onCoordSelect, selectedPoint, onPolygonAdd, onPolygonRemove, onPolygonUpdate, onPolygonClick, activePolygonId, isCentroid },
  ref
) {
  const mapRef       = useRef(null)
  const mapObj       = useRef(null)
  const markerRef    = useRef(null)
  const fileInputRef = useRef(null)
  const [coords, setCoords] = useState(null)

  // Estado de modo seleccion de recintos SIGPAC (paso 3 — construir hoja)
  const [modoSeleccion,    setModoSeleccion]    = useState(false)
  const [selectedRecintos, setSelectedRecintos] = useState(() => new Map())
  const modoSeleccionRef    = useRef(false)
  const selectedRecintosRef = useRef(new Map())
  const sigpacMvtRef        = useRef(null)
  useEffect(() => { modoSeleccionRef.current    = modoSeleccion    }, [modoSeleccion])
  useEffect(() => { selectedRecintosRef.current = selectedRecintos }, [selectedRecintos])

  // Cuando cambia la seleccion, repintar estilos de la capa MVT.
  useEffect(() => {
    sigpacMvtRef.current?.redrawStyles?.()
  }, [selectedRecintos])

  // Refs estables para callbacks de polígono — evitan stale closure dentro del useEffect de init
  const onPolygonAddRef    = useRef(onPolygonAdd)
  const onPolygonRemoveRef = useRef(onPolygonRemove)
  const onPolygonUpdateRef = useRef(onPolygonUpdate)
  const onPolygonClickRef  = useRef(onPolygonClick)
  useEffect(() => { onPolygonAddRef.current    = onPolygonAdd    }, [onPolygonAdd])
  useEffect(() => { onPolygonRemoveRef.current = onPolygonRemove }, [onPolygonRemove])
  useEffect(() => { onPolygonUpdateRef.current = onPolygonUpdate }, [onPolygonUpdate])
  useEffect(() => { onPolygonClickRef.current  = onPolygonClick  }, [onPolygonClick])

  // Contador de IDs y mapas auxiliares
  const polygonIdCounter = useRef(0)
  const layerToId        = useRef(new WeakMap())
  const layersById       = useRef(new Map())   // id → layer

  // Permite a App.jsx eliminar una capa cuando el usuario borra una parcela desde el panel
  useImperativeHandle(ref, () => ({
    removeLayerById: (id) => {
      const map = mapObj.current
      if (!map) return
      const layer = layersById.current.get(id)
      if (layer) {
        map.removeLayer(layer)
        layersById.current.delete(id)
      }
    },
  }), [])

  // Adjunta `pm:edit` a una layer concreta. Geoman dispara el evento en la
  // propia layer (no en el mapa), así que hay que registrarlo individualmente
  // para cada polígono que se cree, cargue desde fichero o resulte de un corte.
  //
  // Marca el feature con `editada_por_usuario: true` para que el motor de
  // intersección distinga "Recortado" (acción explícita) de "Parcial"
  // (dibujo libre que simplemente no coincide con los bordes catastrales).
  const attachEditListener = useCallback((layer) => {
    if (!layer || typeof layer.on !== 'function') return
    layer.on('pm:edit', () => {
      if (typeof layer.toGeoJSON !== 'function') return
      const id = layerToId.current.get(layer)
      if (id == null) return
      const feature = layer.toGeoJSON()
      const t = feature.geometry?.type
      if (t !== 'Polygon' && t !== 'MultiPolygon') return
      feature.properties = { ...(feature.properties || {}), editada_por_usuario: true }
      onPolygonUpdateRef.current?.(id, feature)
    })
  }, [])

  useEffect(() => {
    if (mapObj.current) return

    // maxZoom: 22 permite acercarse mucho más allá del nivel real de las
    // teselas (PNOA ~19, OSM ~19, SIGPAC MVT ~16). Cada capa expone su propio
    // `maxNativeZoom` y Leaflet escala su tesela cuando se pide más zoom —
    // así se evita el "blanco" del que se quejaba la UI a zoom alto.
    const map = L.map(mapRef.current, { center: [40.0, -3.7], zoom: 6, maxZoom: 22 })

    // Cursor flecha (no mano) para sensación de aplicación de escritorio
    const styleEl = document.createElement('style')
    styleEl.textContent =
      '.leaflet-container { cursor: default !important; } ' +
      '.leaflet-dragging .leaflet-container { cursor: default !important; }'
    document.head.appendChild(styleEl)

    // ── Capas base ──────────────────────────────────────────────────────────
    const basemaps = {
      'OpenStreetMap': L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 22,
          maxNativeZoom: 19,   // OSM no expone teselas más allá; el resto se escala
        }
      ),
      'PNOA Máxima Actualidad (IGN)': L.tileLayer(
        'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg',
        {
          attribution: '© <a href="https://www.ign.es">IGN</a> · PNOA',
          maxZoom: 22,
          maxNativeZoom: 19,   // PNOA-MA suele llegar a ~19 según la zona
        }
      ),
    }
    basemaps['PNOA Máxima Actualidad (IGN)'].addTo(map)

    // ── Overlays ────────────────────────────────────────────────────────────
    // "Recintos SIGPAC" agrupa dos capas que se activan/desactivan juntas:
    //   · WMS ráster (sigpac-hubcloud) — guía visual continua a cualquier zoom.
    //   · MVT vectorial (sigpac-hubcloud) — geometrías reales en cliente desde
    //     zoom 13, pareja interactiva que el modo selección de recintos usará
    //     más adelante para construir hojas de cultivo.
    const sigpacWms = L.tileLayer.wms(
      'https://sigpac-hubcloud.es/wms/ows',
      {
        layers: 'AU.Sigpac:recinto',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 0.7,
        attribution:
          '© <a href="https://sigpac-hubcloud.es">SIGPAC FEGA</a> · ' +
          '<a href="https://creativecommons.org/licenses/by/4.0/deed.es">CC BY 4.0</a>',
      }
    )
    const sigpacMvt = sigpacMvtLayer({
      // A zoom <14 el bbox de la OGC API no cabria en el cap del proxy.
      minZoom: 14,
      // Estilo dinamico segun seleccion del recinto (azul si seleccionado).
      featureStyle: (f) => {
        const k = recintoKey(f.properties)
        if (selectedRecintosRef.current.has(k)) {
          return { color: '#2962ff', weight: 2.5, fillColor: '#2962ff', fillOpacity: 0.30, opacity: 1 }
        }
        return { color: '#ff6f00', weight: 1.2, fillOpacity: 0, opacity: 0.85 }
      },
    })
    sigpacMvtRef.current = sigpacMvt

    const overlays = {
      'Recintos SIGPAC': L.layerGroup([sigpacWms, sigpacMvt]),
    }

    L.control.layers(basemaps, overlays, { position: 'topright', collapsed: true }).addTo(map)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)

    // ── Geocoder Nominatim ─────────────────────────────────────────────────
    const GeocoderControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-geocoder-control')
        container.style.cssText = `
          background: white; border-radius: 4px;
          box-shadow: 0 1px 5px rgba(0,0,0,0.4);
          display: flex; align-items: center;
          padding: 0; width: 34px;
          transition: width 0.2s ease;
          position: relative;
        `

        const btn = L.DomUtil.create('button', '', container)
        btn.innerHTML = '🔍'
        btn.title = 'Buscar municipio o lugar'
        btn.style.cssText = `
          background: none; border: none; cursor: pointer;
          font-size: 16px; width: 34px; height: 34px;
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        `

        const input = L.DomUtil.create('input', '', container)
        input.type = 'text'
        input.placeholder = 'Buscar municipio o lugar...'
        input.style.cssText = `
          border: none; outline: none; font-size: 13px;
          width: 240px; max-width: 0; padding: 0;
          transition: max-width 0.2s ease, padding 0.2s ease;
          font-family: inherit; overflow: hidden;
        `

        const results = L.DomUtil.create('div', '', container)
        results.style.cssText = `
          position: absolute; top: 0; left: 38px;
          background: white; border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          max-height: 250px; overflow-y: auto;
          width: 280px; display: none; z-index: 99999;
          font-family: inherit;
        `

        let expanded = false
        let searchTimer = null

        btn.onclick = () => {
          expanded = !expanded
          if (expanded) {
            container.style.width = '280px'
            input.style.maxWidth  = '240px'
            input.style.padding   = '0 6px'
            input.focus()
          } else {
            container.style.width = '34px'
            input.style.maxWidth  = '0'
            input.style.padding   = '0'
            input.value = ''
            results.style.display = 'none'
          }
        }

        input.addEventListener('keydown', e => {
          e.stopPropagation()
          if (e.key === 'Escape') btn.onclick()
        })

        input.addEventListener('input', e => {
          e.stopPropagation()
          clearTimeout(searchTimer)
          const q = input.value.trim()
          if (q.length < 3) { results.style.display = 'none'; return }
          searchTimer = setTimeout(async () => {
            try {
              const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=es&limit=6&accept-language=es`
              )
              const data = await res.json()
              results.innerHTML = ''
              if (!data.length) {
                results.innerHTML = '<div style="padding:8px 12px;color:#888;font-size:12px">Sin resultados</div>'
              } else {
                data.forEach(item => {
                  const row = document.createElement('div')
                  row.textContent = item.display_name
                  row.style.cssText = 'padding:7px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f0f0f0;'
                  row.onmouseover = () => { row.style.background = '#e8eaf6' }
                  row.onmouseout  = () => { row.style.background = 'white'   }
                  row.onclick = () => {
                    map.setView([parseFloat(item.lat), parseFloat(item.lon)], 14)
                    results.style.display = 'none'
                    input.value = item.display_name.split(',')[0]
                  }
                  results.appendChild(row)
                })
              }
              results.style.display = 'block'
            } catch (err) { console.error('[GEOCODER] error:', err) }
          }, 400)
        })

        L.DomEvent.disableClickPropagation(container)
        L.DomEvent.disableScrollPropagation(container)
        container.appendChild(results)
        return container
      },
    })
    new GeocoderControl().addTo(map)

    // ── Geoman: dibujar / editar / eliminar polígonos ──────────────────────
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawMarker: false, drawCircle: false, drawPolyline: false,
      drawRectangle: false, drawCircleMarker: false,
      editMode: true, dragMode: false,
      cutPolygon: true, removalMode: true, rotateMode: false,
    })
    map.pm.setLang('es')

    // Salvaguarda: evita formas auto-intersectadas tras edición o recorte.
    map.pm.setGlobalOptions({ allowSelfIntersection: false })

    // Botón custom: cargar GeoJSON / Shapefile
    map.pm.Toolbar.createCustomControl({
      name: 'cargarGeometria', block: 'draw',
      title: 'Cargar GeoJSON / Shapefile',
      html: '', cssClass: 'pm-cargar-geometria', toggle: false,
      onClick: () => fileInputRef.current?.click(),
    })
    setTimeout(() => {
      document.querySelectorAll('.leaflet-pm-toolbar .button-container, .leaflet-pm-toolbar .leaflet-buttons-control-button')
        .forEach(btn => {
          if (btn.getAttribute('title') !== 'Cargar GeoJSON / Shapefile') return
          const icon = btn.querySelector('.control-icon')
          if (icon) icon.style.backgroundImage =
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='17 8 12 3 7 8'/%3E%3Cline x1='12' y1='3' x2='12' y2='15'/%3E%3C/svg%3E\")"
        })
    }, 500)

    // Botón custom: mi ubicación
    map.pm.Toolbar.createCustomControl({
      name: 'miUbicacion', block: 'custom',
      title: 'Mi ubicación',
      html: '', cssClass: 'pm-mi-ubicacion', toggle: false,
      onClick: () => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition(({ coords }) => {
          map.setView([coords.latitude, coords.longitude], 14)
          L.circleMarker([coords.latitude, coords.longitude], {
            radius: 8, color: '#1a3a2a',
            fillColor: '#2d9d5c', fillOpacity: 0.9, weight: 2,
          }).addTo(map).bindPopup('Mi ubicación').openPopup()
        })
      },
    })
    setTimeout(() => {
      document.querySelectorAll('.leaflet-pm-toolbar .button-container, .leaflet-pm-toolbar .leaflet-buttons-control-button')
        .forEach(btn => {
          if (btn.getAttribute('title') !== 'Mi ubicación') return
          const icon = btn.querySelector('.control-icon')
          if (icon) icon.style.backgroundImage =
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M12 2v4M12 18v4M2 12h4M18 12h4'/%3E%3C/svg%3E\")"
        })
    }, 600)

    // Boton custom: construir hoja desde recintos SIGPAC
    map.pm.Toolbar.createCustomControl({
      name: 'construirSigpac', block: 'custom',
      title: 'Construir hoja desde recintos SIGPAC (zoom >= 13)',
      html: '', cssClass: 'pm-construir-sigpac', toggle: true,
      onClick: () => {
        setModoSeleccion(prev => {
          if (prev) setSelectedRecintos(new Map())
          return !prev
        })
      },
    })
    setTimeout(() => {
      document.querySelectorAll('.leaflet-pm-toolbar .button-container, .leaflet-pm-toolbar .leaflet-buttons-control-button')
        .forEach(btn => {
          if (btn.getAttribute('title') !== 'Construir hoja desde recintos SIGPAC (zoom >= 13)') return
          const icon = btn.querySelector('.control-icon')
          if (icon) icon.style.backgroundImage =
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232962ff' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='M3 11h6V5a2 2 0 0 1 2-2h2v4a2 2 0 0 0 2 2h4v2'/%3E%3Cpath d='M21 13v6a2 2 0 0 1-2 2h-6v-4a2 2 0 0 0-2-2H7v-2'/%3E%3C/svg%3E\")"
        })
    }, 700)

    // ── Coordenadas bajo el cursor ─────────────────────────────────────────
    map.on('mousemove', e => setCoords({ lat: e.latlng.lat.toFixed(5), lng: e.latlng.lng.toFixed(5) }))
    map.on('mouseout',  () => setCoords(null))

    // ── Modo dibujo: silencia click para no disparar onCoordSelect ─────────
    let isDrawing = false
    map.on('pm:drawstart', () => { isDrawing = true  })
    map.on('pm:drawend',   () => { isDrawing = false })

    map.on('click', e => {
      if (isDrawing) return
      // En modo seleccion: detectar recinto bajo el punto con turf y togglear.
      if (modoSeleccionRef.current) {
        const f = sigpacMvtRef.current?.findFeatureAt?.(e.latlng)
        if (!f) return
        const k = recintoKey(f.properties)
        setSelectedRecintos(prev => {
          const next = new Map(prev)
          if (next.has(k)) next.delete(k)
          else            next.set(k, f)
          return next
        })
        return
      }
      onCoordSelect?.({ lon: e.latlng.lng, lat: e.latlng.lat })
    })

    // ── Polígono dibujado con Geoman ───────────────────────────────────────
    map.on('pm:create', e => {
      const layer = e.layer
      if (typeof layer.toGeoJSON !== 'function') return
      const feature = layer.toGeoJSON()
      const t = feature.geometry?.type
      if (t !== 'Polygon' && t !== 'MultiPolygon') return

      polygonIdCounter.current += 1
      const id = polygonIdCounter.current
      layerToId.current.set(layer, id)
      layersById.current.set(id, layer)

      layer.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        onPolygonClickRef.current?.(id)
      })
      attachEditListener(layer)

      onPolygonAddRef.current?.(feature, id)
    })

    // ── Polígono eliminado con la herramienta de borrado de Geoman ─────────
    map.on('pm:remove', e => {
      const id = layerToId.current.get(e.layer)
      if (id != null) {
        layersById.current.delete(id)
        onPolygonRemoveRef.current?.(id)
      }
    })

    // ── Polígono recortado con la tijera (cutPolygon) ─────────────────────
    // Geoman DESTRUYE la layer original y CREA una nueva con el resultado.
    // Mantenemos el mismo id (la parcela sigue siendo "Parcela N") para no
    // sobresaltar al usuario en el panel.
    map.on('pm:cut', e => {
      const oldLayer = e.originalLayer
      const newLayer = e.layer
      if (!newLayer || typeof newLayer.toGeoJSON !== 'function') return
      const id = layerToId.current.get(oldLayer)
      if (id == null) return

      // Limpiar referencias de la antigua y registrar la nueva con el mismo id
      layerToId.current.delete(oldLayer)
      layersById.current.delete(id)
      layerToId.current.set(newLayer, id)
      layersById.current.set(id, newLayer)

      // Clic sobre el resultado del corte = activar parcela (mismo flujo)
      newLayer.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        onPolygonClickRef.current?.(id)
      })
      attachEditListener(newLayer)

      const feature = newLayer.toGeoJSON()
      const t = feature.geometry?.type
      if (t !== 'Polygon' && t !== 'MultiPolygon') return
      feature.properties = { ...(feature.properties || {}), editada_por_usuario: true }
      onPolygonUpdateRef.current?.(id, feature)
    })

    mapObj.current = map
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resaltar polígono activo ─────────────────────────────────────────────
  useEffect(() => {
    const normalStyle = { color: '#1a237e', weight: 2,   fillOpacity: 0.08 }
    const activeStyle = { color: '#1565c0', weight: 3.5, fillOpacity: 0.22, dashArray: null }
    layersById.current.forEach((layer, id) => {
      try { layer.setStyle(id === activePolygonId ? activeStyle : normalStyle) } catch {}
    })
  }, [activePolygonId])

  // ── Marcador: pin (punto libre) o círculo (centroide) ────────────────────
  useEffect(() => {
    if (!mapObj.current) return
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
    if (selectedPoint) {
      markerRef.current = isCentroid
        ? L.circleMarker([selectedPoint.lat, selectedPoint.lon], {
            radius: 7, color: '#0d47a1', weight: 2,
            fillColor: '#5c6bc0', fillOpacity: 0.95,
          }).addTo(mapObj.current)
        : L.marker([selectedPoint.lat, selectedPoint.lon]).addTo(mapObj.current)
    }
  }, [selectedPoint, isCentroid])

  // ─── Parser DBF ────────────────────────────────────────────────────────────
  // ─── Helpers de seleccion de recintos SIGPAC ─────────────────────────────
  // Identificador unico de un recinto = combinacion de sus 5 codigos.
  function recintoKey(p) {
    return `${p.provincia}-${p.municipio}-${p.poligono}-${p.parcela}-${p.recinto}`
  }

  // Suma de superficies de los recintos en el set, en hectareas.
  function totalSuperficieHa(selectedMap) {
    let total = 0
    selectedMap.forEach(f => {
      try { total += area(f) / 10000 } catch (_) { /* ignore */ }
    })
    return total
  }

  // Construye una hoja de cultivo a partir de los recintos seleccionados.
  // Resultado: MultiPolygon que conserva cada recinto como sub-poligono
  // (preserva trazabilidad para futuras intersecciones con capas ZVN, etc.).
  // Metadatos en feature.properties.recintos_origen[].
  const handleCrearHoja = useCallback(() => {
    const map      = mapObj.current
    const features = [...selectedRecintosRef.current.values()]
    if (!map || !features.length) return

    const coords = []
    features.forEach(f => {
      const t = f.geometry?.type
      if (t === 'Polygon')           coords.push(f.geometry.coordinates)
      else if (t === 'MultiPolygon') f.geometry.coordinates.forEach(p => coords.push(p))
    })
    if (!coords.length) return

    const recintosOrigen = features.map(f => {
      const p = f.properties
      return {
        provincia:       p.provincia,
        municipio:       p.municipio,
        poligono:        p.poligono,
        parcela:         p.parcela,
        recinto:         p.recinto,
        uso_sigpac:      p.uso_sigpac ?? null,
        // Datos agronomicos directos del OGC API (sin enriquecimiento extra)
        superficie_ha:   p.superficie_ha != null ? Number(p.superficie_ha)   : null,
        pendiente_media: p.pendiente_media != null ? Number(p.pendiente_media) : null,
        altitud:         p.altitud != null ? Number(p.altitud)               : null,
      }
    })

    const feature = {
      type: 'Feature',
      geometry:   { type: 'MultiPolygon', coordinates: coords },
      properties: {
        nombre:           `Hoja SIGPAC (${features.length} ${features.length === 1 ? 'recinto' : 'recintos'})`,
        recintos_origen:  recintosOrigen,
      },
    }

    // Pintar la hoja como un poligono editable (mismo flujo que carga GeoJSON)
    const geoLayer = L.geoJSON(feature, {
      style: { color: '#1a237e', weight: 2, fillOpacity: 0.08 },
    }).addTo(map)

    const subLayer = geoLayer.getLayers()[0]
    polygonIdCounter.current += 1
    const id = polygonIdCounter.current
    if (subLayer) {
      layerToId.current.set(subLayer, id)
      layerToId.current.set(geoLayer, id)
      layersById.current.set(id, geoLayer)
      subLayer.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        onPolygonClickRef.current?.(id)
      })
      attachEditListener(subLayer)
    }
    onPolygonAddRef.current?.(feature, id)

    // Limpiar seleccion y desactivar modo
    setSelectedRecintos(new Map())
    setModoSeleccion(false)
  }, [attachEditListener])

  function parseDbf(buf) {
    const v   = new DataView(buf)
    const n   = v.getInt32(4, true)
    const hdr = v.getUint16(8, true)
    const fields = []
    let off = 32
    while (v.getUint8(off) !== 0x0D) {
      const name = String.fromCharCode(...new Uint8Array(buf, off, 11)).replace(/\0/g, '')
      const len  = v.getUint8(off + 16)
      fields.push({ name, len })
      off += 32
    }
    const recLen = v.getUint16(10, true)
    const rows   = []
    for (let i = 0; i < n; i++) {
      let pos = hdr + i * recLen + 1
      const row = {}
      fields.forEach(f => {
        const bytes = new Uint8Array(buf, pos, f.len)
        row[f.name] = new TextDecoder().decode(bytes).trim()
        pos += f.len
      })
      rows.push(row)
    }
    return rows
  }

 // ----- Parser SHP -----
  //
  // Convencion de orientacion de anillos (ESRI Shapefile, spec julio 1998 sec. 3.5):
  //   - Outer rings: CLOCKWISE   -> area shoelace NEGATIVA (coords y-norte-arriba)
  //   - Holes:       CCW         -> area shoelace POSITIVA
  //
  // Convencion GeoJSON RFC 7946:
  //   - Outer rings: CCW         -> area shoelace POSITIVA
  //   - Holes:       CW          -> area shoelace NEGATIVA
  //
  // Para preservar la semantica (varios outers = MultiPolygon, no Polygon-con-huecos)
  // distinguimos por area signed, asignamos cada hole al outer que lo contiene
  // (point-in-ring) y reorientamos para cumplir GeoJSON.
  function _signedAreaRing(ring) {
    // Shoelace; ring puede o no estar cerrado (ultimo punto == primero)
    let a = 0
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    }
    return a / 2
  }

  function _pointInRing(pt, ring) {
    // Ray casting; ring puede o no estar cerrado
    const [x, y] = pt
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi + 0) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  function parseShp(buf, props) {
    const v   = new DataView(buf)
    const len = v.getInt32(24, false) * 2
    const feats = []
    let off = 100
    let i   = 0
    while (off < len) {
      off += 4
      const cLen = v.getInt32(off, false) * 2; off += 4
      const type = v.getInt32(off, true)
      if (type === 5 || type === 15) {
        off += 4; off += 32
        const nParts  = v.getInt32(off, true); off += 4
        const nPoints = v.getInt32(off, true); off += 4
        const parts   = []
        for (let p = 0; p < nParts; p++) { parts.push(v.getInt32(off, true)); off += 4 }
        const pts = []
        for (let p = 0; p < nPoints; p++) {
          pts.push([v.getFloat64(off, true), v.getFloat64(off + 8, true)]); off += 16
        }
        // Rings tal como vienen en el shapefile
        const rawRings = parts.map((start, idx) => pts.slice(start, parts[idx + 1] || pts.length))

        // Clasificar por orientacion
        const ringsMeta = rawRings.map(r => ({ ring: r, area: _signedAreaRing(r) }))
        let outers = ringsMeta.filter(r => r.area < 0)
        let holes  = ringsMeta.filter(r => r.area >= 0)

        // Fallback: si ningun ring se detecta como outer, tratamos todos como outers
        if (outers.length === 0) {
          outers = ringsMeta
          holes  = []
        }

        // Construir poligonos: cada outer + sus huecos contenidos
        const polys = outers.map(o => ({ outer: o.ring, holes: [] }))
        for (const h of holes) {
          const pt = h.ring[0]
          let owner = polys.find(p => _pointInRing(pt, p.outer))
          if (!owner) owner = polys[0]
          owner.holes.push(h.ring)
        }

        // Reorientar a convencion GeoJSON: outer CCW (positivo), hole CW (negativo).
        // En shapefile el outer es CW y el hole CCW, asi que invertimos todos.
        const reorient = ring => ring.slice().reverse()

        let geometry
        if (polys.length === 1) {
          geometry = {
            type: 'Polygon',
            coordinates: [reorient(polys[0].outer), ...polys[0].holes.map(reorient)],
          }
        } else {
          geometry = {
            type: 'MultiPolygon',
            coordinates: polys.map(p => [reorient(p.outer), ...p.holes.map(reorient)]),
          }
        }

        feats.push({
          type: 'Feature',
          geometry,
          properties: props[i] || {},
        })
      } else {
        off += cLen
      }
      i++
    }
    return feats
  }

  // ── Carga de fichero GeoJSON o Shapefile ─────────────────────────────────
  const handleFileLoad = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const map = mapObj.current
    if (!map) return

    let features = []
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const { default: JSZip } = await import('jszip')
        const zip   = await JSZip.loadAsync(await file.arrayBuffer())
        const files = Object.values(zip.files)
        const shp   = files.find(f => f.name.toLowerCase().endsWith('.shp'))
        const dbf   = files.find(f => f.name.toLowerCase().endsWith('.dbf'))
        if (!shp) throw new Error('No se encontró archivo .shp dentro del ZIP')
        const shpBuf = await shp.async('arraybuffer')
        const dbfBuf = dbf ? await dbf.async('arraybuffer') : null
        const props  = dbfBuf ? parseDbf(dbfBuf) : []
        features     = parseShp(shpBuf, props)
      } else {
        const parsed = JSON.parse(await file.text())
        if (parsed.type === 'FeatureCollection')       features = parsed.features || []
        else if (parsed.type === 'Feature')            features = [parsed]
        else if (parsed.type === 'Polygon' || parsed.type === 'MultiPolygon')
          features = [{ type: 'Feature', geometry: parsed, properties: {} }]
      }
    } catch (err) {
      alert('Error al cargar el archivo: ' + err.message)
      return
    }

    features = features.filter(f =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    )
    if (!features.length) {
      alert('No se encontraron geometrías de tipo Polígono en el archivo.')
      return
    }
    const CAP = 20
    if (features.length > CAP) {
      alert(`El archivo contiene ${features.length} polígonos. Se cargarán los primeros ${CAP}.`)
      features = features.slice(0, CAP)
    }

    features.forEach(feature => {
      const geoLayer = L.geoJSON(feature, {
        style: { color: '#1a237e', weight: 2, fillOpacity: 0.08 },
      }).addTo(map)

      const subLayer = geoLayer.getLayers()[0]
      polygonIdCounter.current += 1
      const id = polygonIdCounter.current
      if (subLayer) {
        layerToId.current.set(subLayer, id)
        layerToId.current.set(geoLayer, id)
        layersById.current.set(id, geoLayer)
        subLayer.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev)
          onPolygonClickRef.current?.(id)
        })
        attachEditListener(subLayer)
      }

      onPolygonAddRef.current?.(feature, id)
    })

    const bounds = L.geoJSON({ type: 'FeatureCollection', features }).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] })
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

      {coords && (
        <div style={{
          position: 'absolute', bottom: 32, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(26,58,42,0.85)', color: '#e8f5ee',
          padding: '4px 12px', borderRadius: 4, fontSize: 12,
          fontFamily: 'monospace', zIndex: 1000, pointerEvents: 'none',
          letterSpacing: '0.04em',
        }}>
          {coords.lat}° N &nbsp;|&nbsp; {coords.lng}° E &nbsp;·&nbsp; EPSG:4326
        </div>
      )}

      {modoSeleccion && (
        <div style={{
          position: 'absolute', top: 14, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.96)', borderRadius: 6,
          padding: '8px 12px', fontSize: 12, zIndex: 1001,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          display: 'flex', gap: 10, alignItems: 'center',
          fontFamily: 'inherit',
        }}>
          <strong style={{ color: '#1565c0' }}>
            {selectedRecintos.size} {selectedRecintos.size === 1 ? 'recinto' : 'recintos'} seleccionado{selectedRecintos.size === 1 ? '' : 's'}
          </strong>
          {selectedRecintos.size > 0 && (
            <span style={{ color: '#546e7a', fontFamily: 'monospace' }}>
              {totalSuperficieHa(selectedRecintos).toFixed(2)} ha
            </span>
          )}
          <button
            onClick={handleCrearHoja}
            disabled={selectedRecintos.size === 0}
            style={{
              marginLeft: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
              color: '#fff', background: '#2962ff',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              opacity: selectedRecintos.size === 0 ? 0.5 : 1,
            }}
          >Crear hoja</button>
          <button
            onClick={() => { setSelectedRecintos(new Map()); setModoSeleccion(false) }}
            style={{
              padding: '4px 10px', fontSize: 11,
              background: '#eceff1', border: '1px solid #cfd8dc',
              borderRadius: 4, cursor: 'pointer',
            }}
          >Cancelar</button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.zip"
        style={{ display: 'none' }}
        onChange={handleFileLoad}
      />
    </div>
  )
})

export default MapPicker
