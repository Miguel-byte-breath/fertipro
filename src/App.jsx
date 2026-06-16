/**
 * src/App.jsx — FertiPRO (raíz)
 *
 * Layout: mapa a la izquierda + panel lateral con selector de cultivo,
 * tarjeta de recinto SIGPAC y tarjeta de detalle del cultivo.
 *
 * Modos de selección de punto:
 *   - clic en el mapa fuera de polígonos          → punto libre
 *   - clic sobre un polígono o selector de panel  → centroide de la parcela
 *   - "todas las parcelas"                        → centroide medio de los centroides
 *
 * Por ahora la app NO calcula necesidades — solo presenta:
 *   - Datos del recinto SIGPAC del punto activo
 *   - Datos agronómicos del cultivo seleccionado
 * El motor de cálculo (src/calculo/algoritmo.js) está stub-eado y se irá
 * conectando a medida que se incorporen los análisis de suelo y agua.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import MapPicker        from './map/MapPicker'
import CultivoSelector  from './cultivos/CultivoSelector'
import CultivoCard      from './cultivos/CultivoCard'
import RecintoCard      from './components/RecintoCard'
import RecintosOrigenCard from './components/RecintosOrigenCard'
import GeometryPanel    from './components/GeometryPanel'
import { getSigpacRecinto } from './api/sigpac'
import { identifySativum, normalizarSuelo } from './api/sativum-suelo'
import SueloCard        from './components/SueloCard'
import EstrategiaPanel  from './components/EstrategiaPanel'
import {
  centroide,
  centroidesPorParte,
  generarNombreParcela,
  exportarGeoJSON,
  exportarSHP,
} from './utils/geometry'
import { slugify } from './utils/slugify'
import { interseccionRecintos, detectarTipoParcela } from './utils/recintosInterseccion'
import { exportarRecintosSigpacExcel } from './utils/exportExcel'

const ESTADO = {
  IDLE:     'idle',
  CARGANDO: 'cargando',
  LISTO:    'listo',
  ERROR:    'error',
}

export default function App() {
  // ── Estado punto / recinto SIGPAC ──────────────────────────────────────
  const [estado,   setEstado]   = useState(ESTADO.IDLE)
  const [point,    setPoint]    = useState(null)
  const [recinto,  setRecinto]  = useState(null)
  const [error,    setError]    = useState(null)

  // ── Estado parcelas ────────────────────────────────────────────────────
  // activePolygonId: null | 'todas' | number
  const [polygons,        setPolygons]        = useState([])
  const [activePolygonId, setActivePolygonId] = useState(null)
  const polygonCountRef = useRef(0)
  const polygonsRef     = useRef(polygons)
  const mapPickerRef    = useRef(null)
  useEffect(() => { polygonsRef.current = polygons }, [polygons])

  // ── Estado cultivo seleccionado ────────────────────────────────────────
  const [cultivo, setCultivo] = useState(null)

  // ── Estado suelo / agua de riego ───────────────────────────────────────
  const [suelo,  setSuelo]  = useState(null)
  const [cec,    setCec]    = useState(220)
  const [riego,  setRiego]  = useState({ fuenteId: 0, no3MgL: '', dotacionM3: '' })

  // ── Estado estrategia + parámetros de cálculo ──────────────────────────
  const [calculo, setCalculo] = useState({
    strategy:       'MAINTENANCE',
    tillage:        false,
    cropYield:      null,
    recogeResiduos: false,
    quemaResiduos:  false,
    nEcuacion:      {},
  })

  // Reset rendimiento/residuos al cambiar cultivo
  useEffect(() => {
    setCalculo(prev => ({
      ...prev,
      cropYield:      cultivo?.yieldMedium ?? null,
      recogeResiduos: false,
      quemaResiduos:  false,
    }))
  }, [cultivo?.id])

  // ── Estado generación informe Excel SIGPAC ─────────────────────────────
  const [loadingExcel, setLoadingExcel] = useState(false)
  const [excelError,   setExcelError]   = useState(null)

  // ── Consulta SIGPAC ────────────────────────────────────────────────────
  const queryCoords = useCallback(async ({ lon, lat }) => {
    setPoint({ lon, lat })
    setEstado(ESTADO.CARGANDO)
    setError(null)
    setRecinto(null)
    setSuelo(null)
    try {
      const [rec, arcgisData] = await Promise.all([
        getSigpacRecinto(lon, lat),
        identifySativum(lon, lat),
      ])
      setRecinto(rec)
      setSuelo(normalizarSuelo(arcgisData))
      setEstado(ESTADO.LISTO)
    } catch (err) {
      setError(err.message || 'Error consultando SIGPAC.')
      setEstado(ESTADO.ERROR)
    }
  }, [])

  // ── Modo punto libre (clic en mapa) ────────────────────────────────────
  const handleCoordSelect = useCallback(({ lon, lat }) => {
    setActivePolygonId(null)
    queryCoords({ lon, lat })
  }, [queryCoords])

  // ── Clic sobre un polígono existente → modo parcela ────────────────────
  const handlePolygonClick = useCallback((id) => {
    const poly = polygonsRef.current.find(p => p.id === id)
    if (!poly) return
    setActivePolygonId(id)
    queryCoords(poly.centroid)
  }, [queryCoords])

  // ── Selector del panel ─────────────────────────────────────────────────
  const handlePolygonSelect = useCallback((value) => {
    if (value === '') {
      setActivePolygonId(null)
      return
    }
    if (value === 'todas') {
      const all = polygonsRef.current
      if (!all.length) return
      const lat = all.reduce((s, p) => s + p.centroid.lat, 0) / all.length
      const lon = all.reduce((s, p) => s + p.centroid.lon, 0) / all.length
      setActivePolygonId('todas')
      queryCoords({ lon, lat })
    } else {
      const id   = Number(value)
      const poly = polygonsRef.current.find(p => p.id === id)
      if (!poly) return
      setActivePolygonId(id)
      queryCoords(poly.centroid)
    }
  }, [queryCoords])

  // ── Polígono añadido (Geoman o carga de fichero) ───────────────────────
  const handlePolygonAdd = useCallback((feature, id) => {
    polygonCountRef.current += 1
    const nombre =
      feature.properties?.nombre ||
      feature.properties?.name   ||
      feature.properties?.NOMBRE ||
      generarNombreParcela(polygonCountRef.current)

    // Centroides por parte para multipart (Polygon con anillos disjuntos del
    // parser shapefile o MultiPolygon con varias partes). El label principal
    // se coloca en la primera parte; las restantes se renderizan como
    // marcadores secundarios en MapPicker leyendo centroidsPorParte.
    const parts  = centroidesPorParte(feature)
    const cent   = parts.length > 0 ? parts[0] : centroide(feature)
    const newPoly = { id, nombre, feature, centroid: cent, centroidsPorParte: parts }

    setPolygons(prev => [...prev, newPoly])
    setActivePolygonId(id)
    queryCoords(cent)
  }, [queryCoords])

  // ── Polígono editado (mover vértices o tijera) ─────────────────────────
  // Actualiza la geometría guardada y recalcula el centroide. Si la parcela
  // era la activa (individual o "todas"), refresca también la ficha SIGPAC
  // consultando el nuevo centroide.
  const handlePolygonUpdate = useCallback((id, feature) => {
    const parts = centroidesPorParte(feature)
    const cent  = parts.length > 0 ? parts[0] : centroide(feature)
    setPolygons(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, feature, centroid: cent, centroidsPorParte: parts } : p
      )
      // Refresco condicional de SIGPAC: solo si la parcela editada afecta
      // al centroide que ahora mismo se está consultando.
      setActivePolygonId(currentActive => {
        if (currentActive === id) {
          queryCoords(cent)
        } else if (currentActive === 'todas' && next.length) {
          const lat = next.reduce((s, p) => s + p.centroid.lat, 0) / next.length
          const lon = next.reduce((s, p) => s + p.centroid.lon, 0) / next.length
          queryCoords({ lon, lat })
        }
        return currentActive
      })
      return next
    })
  }, [queryCoords])

  // ── Polígono eliminado vía Geoman ──────────────────────────────────────
  const handlePolygonRemove = useCallback((id) => {
    setPolygons(prev => {
      const next = prev.filter(p => p.id !== id)
      setActivePolygonId(current => {
        if (current !== id && current !== 'todas') return current
        if (next.length > 0) {
          const last = next[next.length - 1]
          queryCoords(last.centroid)
          return last.id
        }
        setPoint(null)
        setEstado(ESTADO.IDLE)
        setRecinto(null)
        return null
      })
      return next
    })
  }, [queryCoords])

  const handlePolygonRename = useCallback((id, nombre) => {
    setPolygons(prev => prev.map(p => p.id === id ? { ...p, nombre } : p))
  }, [])

  const handlePanelRemove = useCallback((id) => {
    mapPickerRef.current?.removeLayerById(id)
    handlePolygonRemove(id)
  }, [handlePolygonRemove])

  // Selección activa del panel manda en la descarga:
  //   activePolygonId === null    → punto libre → no descarga (botón deshabilitado)
  //   activePolygonId === 'todas' → descarga todas las parcelas
  //   activePolygonId === <id>    → descarga solo esa parcela
  const polygonsToExport = useCallback(() => {
    if (activePolygonId == null) return null
    if (activePolygonId === 'todas') {
      return { features: polygons, baseName: 'fertipro_parcelas' }
    }
    const poly = polygons.find(p => p.id === activePolygonId)
    if (!poly) return null
    return { features: [poly], baseName: `fertipro_${slugify(poly.nombre)}` }
  }, [polygons, activePolygonId])

  const handleDownloadGeoJSON = useCallback(() => {
    const sel = polygonsToExport()
    if (!sel) return
    exportarGeoJSON(
      sel.features.map(p => ({ ...p.feature, properties: { id: p.id, nombre: p.nombre } })),
      sel.baseName
    )
  }, [polygonsToExport])

  const handleDownloadSHP = useCallback(() => {
    const sel = polygonsToExport()
    if (!sel) return
    exportarSHP(
      sel.features.map(p => ({ ...p.feature, properties: { id: p.id, nombre: p.nombre } })),
      sel.baseName
    )
  }, [polygonsToExport])

  // ── Excel SIGPAC: recintos intersectados con cada parcela activa ───────
  // Lazy: el cálculo (incluida una llamada a /api/sigpac-bbox por parcela
  // "libre" o editada) solo ocurre al pulsar el botón.
  const handleDownloadExcel = useCallback(async () => {
    const sel = polygonsToExport()
    if (!sel) return
    setLoadingExcel(true)
    setExcelError(null)
    try {
      const parcelas = await Promise.all(sel.features.map(async (p) => ({
        nombre:   p.nombre,
        tipo:     detectarTipoParcela(p.feature),
        feature:  p.feature,
        recintos: await interseccionRecintos(p.feature),
      })))
      // baseName: fertipro_parcelas → fertipro_sigpac
      //           fertipro_<slug>   → fertipro_sigpac_<slug>
      const xlsxName = sel.baseName === 'fertipro_parcelas'
        ? 'fertipro_sigpac'
        : sel.baseName.replace(/^fertipro_/, 'fertipro_sigpac_')
      await exportarRecintosSigpacExcel(parcelas, xlsxName)
    } catch (err) {
      setExcelError(err.message || 'Error generando el informe Excel.')
    } finally {
      setLoadingExcel(false)
    }
  }, [polygonsToExport])

  // ── Render ─────────────────────────────────────────────────────────────
  const cargando      = estado === ESTADO.CARGANDO
  const isCentroid    = activePolygonId != null

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.brand}>
          <span style={S.logoBadge}>F</span>
          <div>
            <div style={S.brandTitle}>FertiPRO</div>
            <div style={S.brandSub}>Simulador de necesidades de nutrientes</div>
          </div>
        </div>
        <ModoIndicator activeId={activePolygonId} polygons={polygons} point={point} />
      </header>

      <div style={S.body}>
        <div style={S.mapWrap}>
          <MapPicker
            ref={mapPickerRef}
            onCoordSelect={handleCoordSelect}
            selectedPoint={point}
            onPolygonAdd={handlePolygonAdd}
            onPolygonRemove={handlePolygonRemove}
            onPolygonUpdate={handlePolygonUpdate}
            onPolygonClick={handlePolygonClick}
            activePolygonId={activePolygonId}
            activePolygon={polygons.find(p => p.id === activePolygonId) || null}
            isCentroid={isCentroid}
          />
          {estado === ESTADO.IDLE && (
            <div style={S.hintIdle}>
              Haz clic en el mapa o dibuja una parcela para comenzar
            </div>
          )}
          {cargando && <div style={S.hintLoad}>⏳ Consultando SIGPAC…</div>}
        </div>

        <aside style={S.aside}>
          <div style={{ padding: 12 }}>
            <CultivoSelector
              value={cultivo?.name ?? null}
              onChange={setCultivo}
            />
          </div>

          <GeometryPanel
            polygons={polygons}
            activeId={activePolygonId}
            onSelect={handlePolygonSelect}
            onRename={handlePolygonRename}
            onRemove={handlePanelRemove}
            onDownloadGeoJSON={handleDownloadGeoJSON}
            onDownloadSHP={handleDownloadSHP}
            onDownloadExcel={handleDownloadExcel}
            loadingExcel={loadingExcel}
            excelError={excelError}
          />

          <RecintoCard
            recinto={recinto}
            loading={cargando}
            error={estado === ESTADO.ERROR ? error : null}
          />

          {/* Recintos SIGPAC que componen la hoja activa (si es construida) */}
          {(() => {
            if (activePolygonId == null || activePolygonId === 'todas') return null
            const poly = polygons.find(p => p.id === activePolygonId)
            const recintos = poly?.feature?.properties?.recintos_origen
            return <RecintosOrigenCard recintos={recintos} />
          })()}

          <SueloCard
            suelo={suelo}
            loading={cargando}
            cec={cec}
            onCecChange={setCec}
            riego={riego}
            onRiegoChange={setRiego}
          />

          <EstrategiaPanel
            cultivo={cultivo}
            params={calculo}
            onChange={setCalculo}
          />

          <CultivoCard cultivo={cultivo} />

          <div style={S.footer}>
            <strong>v0.1.0 · stub</strong> · Mapa + SIGPAC + cat. cultivos + suelo + estrategia.<br />
            Pendiente: motor de cálculo NPK, exportar.
          </div>
        </aside>
      </div>
    </div>
  )
}

function ModoIndicator({ activeId, polygons, point }) {
  if (!point) return null
  let label, color
  if (activeId === 'todas') {
    label = `📐 Centroide general (${polygons.length})`
    color = '#e8f5e9'
  } else if (activeId != null) {
    const p = polygons.find(p => p.id === activeId)
    label = `🗺️ ${p?.nombre ?? 'parcela'}`
    color = '#e8eaf6'
  } else {
    label = '📍 Punto seleccionado'
    color = 'rgba(255,255,255,0.15)'
  }
  return (
    <div style={S.modo}>
      <div style={{ ...S.modoLabel, background: color, color: activeId != null ? '#1a237e' : 'rgba(255,255,255,0.9)' }}>
        {label}
      </div>
      <div style={S.modoCoords}>
        Lon: {point.lon.toFixed(5)} · Lat: {point.lat.toFixed(5)}
      </div>
    </div>
  )
}

const S = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f7fa' },
  header: {
    background: '#1a237e', color: '#fff',
    padding: '10px 20px',
    display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 32, height: 32, borderRadius: 6,
    background: '#3949ab', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 18,
  },
  brandTitle: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 },
  brandSub:   { fontSize: 11, opacity: 0.75 },
  modo:       { marginLeft: 'auto', textAlign: 'right', fontSize: 11 },
  modoLabel:  {
    padding: '2px 8px', borderRadius: 3, marginBottom: 2, fontWeight: 600,
  },
  modoCoords: { opacity: 0.8 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  mapWrap: { flex: 1, position: 'relative' },
  aside: {
    width: 400, background: '#fff',
    display: 'flex', flexDirection: 'column',
    overflow: 'auto',
    boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
  },
  hintIdle: {
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(26,35,126,0.85)', color: '#fff',
    padding: '8px 18px', borderRadius: 20, fontSize: 13,
    pointerEvents: 'none', zIndex: 1000, whiteSpace: 'nowrap',
  },
  hintLoad: {
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(26,35,126,0.92)', color: '#fff',
    padding: '8px 18px', borderRadius: 20, fontSize: 13,
    pointerEvents: 'none', zIndex: 1000,
  },
  footer: {
    margin: 12, padding: 10,
    background: '#fffde7', border: '1px dashed #fff59d', borderRadius: 6,
    fontSize: 11, color: '#827717', lineHeight: 1.5,
  },
}
