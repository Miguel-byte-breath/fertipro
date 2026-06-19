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
import turfArea from '@turf/area'
import MapPicker        from './map/MapPicker'
import CultivoSelector  from './cultivos/CultivoSelector'
import CultivoCard      from './cultivos/CultivoCard'
import ParcelaInfoCard  from './components/ParcelaInfoCard'
import GeometryPanel    from './components/GeometryPanel'
import { getSigpacRecinto } from './api/sigpac'
import { identifySativum, normalizarSuelo } from './api/sativum-suelo'
import SueloCard        from './components/SueloCard'
import EstrategiaPanel       from './components/EstrategiaPanel'
import CultivoAnteriorPanel  from './components/CultivoAnteriorPanel'
import ResultadosCard           from './components/ResultadosCard'
import AsesoramientoPanel        from './components/AsesoramientoPanel'
import FertilizanteManualPanel   from './components/FertilizanteManualPanel'
import SativumApplicationDialog  from './components/SativumApplicationDialog'
import { calcularNPK, calcularNAgua }  from './api/sativum-algo'
import { FUENTE_SUBTERRANEA, FUENTE_SIN_RIEGO } from './data/sativum/fuentesAgua'
import {
  centroide,
  centroidesPorParte,
  generarNombreParcela,
  exportarGeoJSON,
  exportarSHP,
} from './utils/geometry'
import { slugify } from './utils/slugify'
import { interseccionRecintos, enrichRecintos, detectarTipoParcela } from './utils/recintosInterseccion'
import { exportarRecintosSigpacExcel, exportarPlanAbonado } from './utils/exportExcel'
import { exportarPlanAbonadoPdf } from './utils/exportPdf'
import { FUENTES_AGUA } from './data/sativum/fuentesAgua'

const ESTADO = {
  IDLE:     'idle',
  CARGANDO: 'cargando',
  LISTO:    'listo',
  ERROR:    'error',
}

// CEC por defecto según textura simplificada (valores Sativum, meq/kg)
// El usuario puede editarlo manualmente en SueloCard si tiene analítica propia.
const CEC_BY_SOIL_TYPE = {
  SANDY:      30,
  SANDY_LOAM: 75,
  LOAM:       100,
  SILTY_LOAM: 80,
  CLAY_LOAM:  220,
  CLAY:       300,
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
  const [riego,  setRiego]  = useState({ fuenteId: 0, no3MgL: '', dotacionM3: '', pMgL: '', kMgL: '' })

  // ── Estado cultivo anterior (rotación) ────────────────────────────────
  const [cultivoAnterior,       setCultivoAnterior]       = useState(null)
  const [cultivoAnteriorParams, setCultivoAnteriorParams] = useState({
    cropYield:      null,
    laboreo:        false,
    recogeResiduos: false,
    quemaResiduos:  false,
  })

  // ── Estado asesor responsable (REGFER) — persiste en localStorage ─────
  const [asesor, setAsesor] = useState(() => {
    try {
      const saved = localStorage.getItem('fertipro_asesor')
      return saved ? JSON.parse(saved) : { regfer: '', nombre: '', apellidos: '', nif: '', telefono: '', email: '' }
    } catch {
      return { regfer: '', nombre: '', apellidos: '', nif: '', telefono: '', email: '' }
    }
  })
  useEffect(() => {
    try { localStorage.setItem('fertipro_asesor', JSON.stringify(asesor)) } catch { /* noop */ }
  }, [asesor])

  // ── Estado fecha del plan ─────────────────────────────────────────────
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [fechaInicioCiclo, setFechaInicioCiclo] = useState('')
  const [fechaFinCiclo,    setFechaFinCiclo]    = useState('')

  // ── Estado estrategia + parámetros de cálculo ──────────────────────────
  const [calculo, setCalculo] = useState({
    strategy:       'MAINTENANCE',
    tillage:        false,
    cropYield:      null,
    recogeResiduos: false,
    quemaResiduos:  false,
    abonoVerde:     false,
    nEcuacion:      {},
    algoOverrides:  {},
  })

  // Reset rendimiento/residuos al cambiar cultivo
  useEffect(() => {
    setCalculo(prev => ({
      ...prev,
      cropYield:      cultivo?.yieldMedium ?? null,
      recogeResiduos: false,
      quemaResiduos:  false,
      abonoVerde:     false,
    }))
  }, [cultivo?.id])

  // CEC por textura: se actualiza cuando carga el suelo ArcGIS.
  // El usuario puede sobreescribir manualmente en SueloCard.
  useEffect(() => {
    if (!suelo?.soilType) return
    setCec(CEC_BY_SOIL_TYPE[suelo.soilType] ?? 220)
  }, [suelo?.soilType])

  // ── Plan de aplicaciones unificado (Sativum + manual) ───────────────────
  // Cada item: { id, origen:'sativum'|'manual', nombre, tipo, tipoSIEX,
  //              n, p2o5, k2o, cantidad, fechaAplicacion, esPersonalizado }
  const [planItems, setPlanItems] = useState([])

  // Diálogo de aplicación Sativum
  const [sativumDialogOpen, setSativumDialogOpen] = useState(false)

  // Handler unificado: acepta un item o array de items
  const handleAddPlanItems = useCallback((items) => {
    const arr = Array.isArray(items) ? items : [items]
    setPlanItems(prev => [...prev, ...arr])
  }, [])

  // ── Estado recintos SIGPAC + ZVN (se popula en queryCoords) ──────────────
  const [recintos,        setRecintos]        = useState(null)
  const [recintosLoading, setRecintosLoading] = useState(false)

  // ── Estado resultados NPK ──────────────────────────────────────────────
  const [resultados, setResultados] = useState({
    npk:              null,
    npkParaRec:       null,   // NPK neto a cubrir por fertilizante (después de riego)
    adjustedNutrient: 'N',
    nRiego:           0,
    pRiego:           0,
    kRiego:           0,
    loading:          false,
    error:            null,
  })

  // ── Cálculo NPK ────────────────────────────────────────────────────────
  const handleCalcularNecesidades = useCallback(async () => {
    if (!cultivo) return
    setResultados({ npk: null, npkParaRec: null, adjustedNutrient: 'N', nRiego: 0, pRiego: 0, kRiego: 0, loading: true, error: null })
    setPlanItems([])   // resetear plan al recalcular

    try {
      // Riego efectivo según fuente SIEX
      const fuenteId = riego.fuenteId
      let riegoOpts = null
      if (fuenteId !== FUENTE_SIN_RIEGO) {
        const no3 = fuenteId === FUENTE_SUBTERRANEA
          ? (suelo?.no3Irrigation ?? riego.no3MgL)
          : riego.no3MgL
        const dot = riego.dotacionM3
        if (no3 && dot) {
          riegoOpts = { no3MgL: Number(no3), dotacionM3: Number(dot) }
        }
      }

      const cultivosArr = []
      // Cultivo anterior (precede en la rotación)
      if (cultivoAnterior) {
        cultivosArr.push({
          cultivo:        cultivoAnterior,
          cropYield:      cultivoAnteriorParams.cropYield ?? cultivoAnterior.yieldMedium ?? 0,
          cv:             cultivoAnterior.cv ?? 0,    // CV = 0 default en Sativum; no afecta al cálculo actual
          recogeResiduos: cultivoAnteriorParams.recogeResiduos,
          quemaResiduos:  cultivoAnteriorParams.quemaResiduos,
        })
      }
      // Cultivo actual
      cultivosArr.push({
        cultivo,
        cropYield:      calculo.cropYield ?? cultivo.yieldMedium ?? 0,
        cv:             cultivo.cv ?? 0,    // CV = 0 default en Sativum; no afecta al cálculo actual
        recogeResiduos: calculo.recogeResiduos,
        quemaResiduos:  calculo.quemaResiduos,
      })

      // Suelo mínimo si no hay datos ArcGIS
      const sueloEfectivo = suelo ?? {
        soilType:      'LOAM',
        organicMatter: 2,
        ph:            null,
        pOlsen:        null,
        kSoil:         null,
      }

      const npkData = await calcularNPK(cultivosArr, sueloEfectivo, {
        strategy:      calculo.strategy,
        tillage:       cultivoAnteriorParams.laboreo,
        cec,
        riego:         riegoOpts,
        nEcuacion:     calculo.nEcuacion,
        algoOverrides: calculo.algoOverrides ?? {},
      })

      if (!npkData) {
        setResultados({ npk: null, recomendacion: null, adjustedNutrient: 'N', nRiego: 0, pRiego: 0, kRiego: 0, loading: false, error: 'No se obtuvo respuesta del motor Sativum.' })
        return
      }

      // La API devuelve un item en recommendations[] por cada cultivo de la rotación,
      // en el mismo orden: [cultivoAnterior?, cultivoActual].
      // El último item SIEMPRE corresponde al cultivo actual (objetivo del plan).
      const lastRec = npkData.recommendations?.at(-1)
      const npkNorm = {
        n: npkData.n ?? lastRec?.n ?? 0,
        p: npkData.p ?? lastRec?.p ?? 0,
        k: npkData.k ?? lastRec?.k ?? 0,
      }
      console.debug('[NPK norm]', npkNorm)

      // N/P/K aportados por riego (client-side — /algo/ solo acepta N via n_other)
      const dotEf  = Number(riego.dotacionM3) || 0
      // nRiego: la API ya lo descontó via n_other; lo calculamos para mostrarlo en display
      const nRiego = riego.fuenteId !== FUENTE_SIN_RIEGO
        ? calcularNAgua(Number(riego.no3MgL) || 0, dotEf)
        : 0
      const pRiego = (riego.fuenteId !== FUENTE_SIN_RIEGO && riego.pMgL && dotEf)
        ? Number(riego.pMgL) * dotEf / 1000
        : 0
      const kRiego = (riego.fuenteId !== FUENTE_SIN_RIEGO && riego.kMgL && dotEf)
        ? Number(riego.kMgL) * dotEf / 1000
        : 0

      // npkParaRec: valores netos que debe cubrir el fertilizante (P/K ya descontados del riego)
      const npkParaRec = {
        n: npkNorm.n,
        p: Math.max(0, npkNorm.p - pRiego),
        k: Math.max(0, npkNorm.k - kRiego),
      }
      console.debug('[npkParaRec]', npkParaRec, 'pRiego:', pRiego, 'kRiego:', kRiego)

      // Elegir adjustedNutrient sobre los valores netos
      // (si N=0 — p.ej. leguminosa anterior cubre todo el N — Sativum no puede
      //  generar combinaciones con adjustedNutrient='N')
      const adjNutrient = (() => {
        const { n, p, k } = npkParaRec
        const pOx = p * 2.2914   // comparar en UF estándar
        const kOx = k * 1.2046
        if (n  >= pOx && n  >= kOx && n  > 0) return 'N'
        if (pOx >= n  && pOx >= kOx && pOx > 0) return 'P'
        if (kOx > 0)                            return 'K'
        return 'N'   // fallback (todos cero — Sativum devolverá observación)
      })()
      console.debug('[adjustedNutrient]', adjNutrient, 'npkParaRec:', npkParaRec)

      setResultados({ npk: npkData, npkParaRec, adjustedNutrient: adjNutrient, nRiego, pRiego, kRiego, loading: false, error: null })
    } catch (err) {
      setResultados({ npk: null, npkParaRec: null, adjustedNutrient: 'N', nRiego: 0, pRiego: 0, kRiego: 0, loading: false, error: err.message || 'Error en el cálculo.' })
    }
  }, [cultivo, suelo, cec, riego, calculo, cultivoAnterior, cultivoAnteriorParams])

  // ── Estado generación informe Excel SIGPAC ─────────────────────────────
  const [loadingExcel, setLoadingExcel] = useState(false)
  const [excelError,   setExcelError]   = useState(null)

  // ── Consulta SIGPAC ────────────────────────────────────────────────────

  // Convierte el objeto recinto de getSigpacRecinto() al formato normalizado
  // de interseccionRecintos/enrichRecintos para enriquecerlo con recinfo+ZVN.
  function toRecintoItem(rec) {
    if (!rec) return null
    return {
      provincia:   Number(rec.provincia)                      || 0,
      municipio:   rec.municipio_cod || Number(rec.municipio) || 0,
      agregado:    rec.agregado ?? 0,
      zona:        rec.zona    ?? 0,
      poligono:    rec.poligono,
      parcela:     rec.parcela,
      recinto:     rec.recinto,
      uso_sigpac:  rec.uso_sigpac ?? null,
      coef_regadio: null,
      pendiente_media: rec.pendiente_media ?? null,
      altitud:     rec.altitud ?? null,
      superficie_total_ha:        rec.superficie_ha ?? null,
      superficie_interseccion_ha: rec.superficie_ha ?? null,
      pct_ocupado:  100,
      observacion: 'Completo',
    }
  }

  const queryCoords = useCallback(async ({ lon, lat, feature = null }) => {
    setPoint({ lon, lat })
    setEstado(ESTADO.CARGANDO)
    setError(null)
    setRecinto(null)
    setRecintos(null)
    setRecintosLoading(true)
    setSuelo(null)
    try {
      const [rec, arcgisData] = await Promise.all([
        getSigpacRecinto(lon, lat),
        identifySativum(lon, lat),
      ])
      setRecinto(rec)
      setSuelo(normalizarSuelo(arcgisData))
      setEstado(ESTADO.LISTO)

      // Enriquecimiento de recintos + ZVN en segundo plano (puede tardar varios segundos)
      try {
        let recList
        if (feature) {
          // Polígono activo → intersección completa con recinfo + ZVN
          recList = await interseccionRecintos(feature)
        } else if (rec) {
          // Punto libre → enriquecer el único recinto con recinfo + ZVN
          recList = await enrichRecintos([toRecintoItem(rec)])
        } else {
          recList = []
        }
        setRecintos(recList)
      } catch (err) {
        console.warn('[queryCoords] recintos/ZVN error:', err.message)
        setRecintos([])
      } finally {
        setRecintosLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Error consultando SIGPAC.')
      setEstado(ESTADO.ERROR)
      setRecintosLoading(false)
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
    queryCoords({ ...poly.centroid, feature: poly.feature })
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
      queryCoords({ lon, lat })  // sin feature para 'todas' — usa el punto del centroide
    } else {
      const id   = Number(value)
      const poly = polygonsRef.current.find(p => p.id === id)
      if (!poly) return
      setActivePolygonId(id)
      queryCoords({ ...poly.centroid, feature: poly.feature })
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
    queryCoords({ ...cent, feature })
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
          queryCoords({ ...cent, feature })
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

  // ── Exportar plan de abonado ───────────────────────────────────────────
  const [exportingPlan, setExportingPlan] = useState(false)

  const handleExportarPlan = useCallback(async () => {
    if (!cultivo || !resultados.npk) return
    setExportingPlan(true)
    try {
      const fuenteLabel = FUENTES_AGUA.find(f => f.id === riego.fuenteId)?.label
      const baseName = cultivo.name
        ? `fertipro_plan_${cultivo.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
        : 'fertipro_plan_abonado'
      // Usar recinto enriquecido (recinfo) si está disponible en la lista
      const recintoEnriquecido = recinto && recintos
        ? (recintos.find(r =>
            r.provincia === recinto.provincia &&
            r.municipio  === recinto.municipio &&
            r.poligono   === recinto.poligono  &&
            r.parcela    === recinto.parcela   &&
            r.recinto    === recinto.recinto
          ) ?? recinto)
        : recinto

      await exportarPlanAbonado({
        point,
        recinto: recintoEnriquecido,
        cultivo,
        suelo,
        cec,
        riego: { ...riego, fuenteLabel },
        calculo,
        fecha,
        fechaInicioCiclo,
        fechaFinCiclo,
        npk:                  resultados.npk,
        recomendacion:        null,
        adjustedNutrient:     resultados.adjustedNutrient,
        cultivoAnterior,
        cultivoAnteriorParams,
        asesor,
        planItems,
        baseName,
      })
    } finally {
      setExportingPlan(false)
    }
  }, [cultivo, resultados, point, recinto, recintos, suelo, cec, riego, calculo, fecha, fechaInicioCiclo, fechaFinCiclo, asesor, planItems])

  // ── Exportar plan de abonado PDF ──────────────────────────────────────
  const [exportingPlanPdf, setExportingPlanPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  const handleExportarPlanPdf = useCallback(async () => {
    if (!cultivo || !resultados.npk) return
    setExportingPlanPdf(true)
    setPdfError(null)
    try {
      const fuenteLabel = FUENTES_AGUA.find(f => f.id === riego.fuenteId)?.label

      // Calcular recintos intersectados y superficie total de las parcelas activas
      const sel = polygonsToExport()
      let recintosList = []
      let supTotalHa   = null

      if (sel?.features?.length > 0) {
        const parcelasConRecintos = await Promise.all(
          sel.features.map(async p => ({
            feature:  p.feature,
            recintos: await interseccionRecintos(p.feature),
          }))
        )

        // Lista plana de recintos únicos (evitar duplicados por solape de parcelas)
        const vistos = new Set()
        for (const { feature, recintos } of parcelasConRecintos) {
          for (const r of recintos) {
            const key = `${r.provincia}-${r.municipio}-${r.poligono}-${r.parcela}-${r.recinto}`
            if (!vistos.has(key)) {
              vistos.add(key)
              recintosList.push(r)
            }
          }
          supTotalHa = (supTotalHa ?? 0) + turfArea(feature) / 10000
        }
      } else if (recinto) {
        // Fallback: usar el recinto de punto activo si no hay polígonos
        recintosList = [recinto]
      }

      const baseName = cultivo.name
        ? `fertipro_plan_${cultivo.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
        : 'fertipro_plan_nutrientes'

      await exportarPlanAbonadoPdf({
        cultivo,
        cultivoAnterior,
        cultivoAnteriorParams,
        calculo,
        asesor,
        fecha,
        fechaInicioCiclo,
        fechaFinCiclo,
        recintos:    recintosList,
        supTotalHa,
        riego:       { ...riego, fuenteLabel },
        npk:         resultados.npk,
        recomendacion: null,
        nRiego:      resultados.nRiego,
        pRiego:      resultados.pRiego,
        kRiego:      resultados.kRiego,
        planItems,
        baseName,
      })
    } catch (err) {
      setPdfError(err.message || 'Error generando el PDF.')
    } finally {
      setExportingPlanPdf(false)
    }
  }, [cultivo, resultados, recinto, riego, calculo, fecha, fechaInicioCiclo, fechaFinCiclo, cultivoAnterior, cultivoAnteriorParams, asesor, planItems, polygonsToExport])

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

          {/* ── Geometría + recintos SIGPAC — primer bloque, antes del cultivo ── */}
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

          <ParcelaInfoCard
            recintos={recintos}
            loading={recintosLoading}
            error={estado === ESTADO.ERROR ? error : null}
          />

          <AsesoramientoPanel
            asesor={asesor}
            onChange={setAsesor}
          />

          <div style={{ padding: 12 }}>

            {/* ── Fecha del plan ── primer dato del formulario ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#78909c', display: 'block', marginBottom: 2 }}>
                Fecha del plan de abonado
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                style={{
                  width: '100%', padding: '5px 7px', fontSize: 12,
                  border: '1px solid #cfd8dc', borderRadius: 4,
                  fontFamily: 'inherit', color: '#263238', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* ── Fechas de ciclo ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#78909c', display: 'block', marginBottom: 2 }}>
                  Inicio de ciclo
                </label>
                <input
                  type="date"
                  value={fechaInicioCiclo}
                  onChange={e => setFechaInicioCiclo(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 7px', fontSize: 12,
                    border: '1px solid #cfd8dc', borderRadius: 4,
                    fontFamily: 'inherit', color: '#263238', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#78909c', display: 'block', marginBottom: 2 }}>
                  Fin de ciclo
                </label>
                <input
                  type="date"
                  value={fechaFinCiclo}
                  onChange={e => setFechaFinCiclo(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 7px', fontSize: 12,
                    border: '1px solid #cfd8dc', borderRadius: 4,
                    fontFamily: 'inherit', color: '#263238', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <CultivoSelector
              value={cultivo?.name ?? null}
              onChange={setCultivo}
            />

            {/* ── Rendimiento esperado ── visible en cuanto hay cultivo ── */}
            {cultivo && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#546e7a', marginBottom: 6 }}>
                  Rendimiento esperado
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#78909c' }}>Producción objetivo</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      value={calculo.cropYield ?? ''}
                      placeholder={cultivo.yieldMedium != null ? String(cultivo.yieldMedium) : '0'}
                      min={0}
                      step={100}
                      onChange={e => setCalculo(prev => ({ ...prev, cropYield: e.target.value === '' ? null : Number(e.target.value) }))}
                      style={{ width: 90, padding: '3px 6px', border: '1px solid #cfd8dc', borderRadius: 3, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: '#263238' }}
                    />
                    <span style={{ color: '#90a4ae', fontSize: 10 }}>kg/ha</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#90a4ae', marginTop: 3 }}>
                  Catálogo Sativum — mín: <strong>{cultivo.yieldLow ?? '—'}</strong> · med:{' '}
                  <strong>{cultivo.yieldMedium ?? '—'}</strong> · máx:{' '}
                  <strong>{cultivo.yieldHigh ?? '—'}</strong> kg/ha
                </div>
              </div>
            )}
          </div>

          {/* ── Ficha agronómica del cultivo ── */}
          <CultivoCard cultivo={cultivo} />

          <SueloCard
            suelo={suelo}
            loading={cargando}
            cec={cec}
            onCecChange={setCec}
            riego={riego}
            onRiegoChange={setRiego}
          />

          <CultivoAnteriorPanel
            cultivo={cultivoAnterior}
            params={cultivoAnteriorParams}
            onCultivoChange={setCultivoAnterior}
            onParamsChange={setCultivoAnteriorParams}
          />

          <EstrategiaPanel
            cultivo={cultivo}
            params={calculo}
            onChange={setCalculo}
            soilType={suelo?.soilType ?? 'LOAM'}
          />

          {/* Botón calcular */}
          <div style={S.calcWrap}>
            <button
              onClick={handleCalcularNecesidades}
              disabled={!cultivo || resultados.loading}
              style={{
                ...S.calcBtn,
                opacity: (!cultivo || resultados.loading) ? 0.5 : 1,
                cursor:  (!cultivo || resultados.loading) ? 'not-allowed' : 'pointer',
              }}
            >
              {resultados.loading ? '⏳ Calculando…' : '🧮 Calcular necesidades NPK'}
            </button>
            {!cultivo && (
              <div style={S.calcHint}>Selecciona un cultivo para calcular.</div>
            )}
          </div>

          <ResultadosCard
            npk={resultados.npk}
            npkParaRec={resultados.npkParaRec}
            planItems={planItems}
            nRiego={resultados.nRiego}
            pRiego={resultados.pRiego}
            kRiego={resultados.kRiego}
            cultivo={cultivo}
            loading={resultados.loading}
            error={resultados.error}
            onOpenSativumDialog={() => setSativumDialogOpen(true)}
          />

          <FertilizanteManualPanel
            planItems={planItems}
            onChange={setPlanItems}
            npk={resultados.npk}
            npkParaRec={resultados.npkParaRec}
            nRiego={resultados.nRiego}
            pRiego={resultados.pRiego}
            kRiego={resultados.kRiego}
            fechaInicioCiclo={fechaInicioCiclo}
          />

          {sativumDialogOpen && resultados.npkParaRec && (
            <SativumApplicationDialog
              npkParaRec={resultados.npkParaRec}
              planItems={planItems}
              adjustedNutrient={resultados.adjustedNutrient}
              onAdd={(items) => { handleAddPlanItems(items); setSativumDialogOpen(false) }}
              onClose={() => setSativumDialogOpen(false)}
            />
          )}

          {/* Exportar plan */}
          {resultados.npk && !resultados.loading && (
            <div style={S.calcWrap}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleExportarPlan}
                  disabled={exportingPlan}
                  style={{
                    ...S.calcBtn,
                    flex: 1,
                    background: '#2e7d32',
                    opacity: exportingPlan ? 0.6 : 1,
                    cursor: exportingPlan ? 'not-allowed' : 'pointer',
                  }}
                >
                  {exportingPlan ? '⏳ Exportando…' : '📊 Excel'}
                </button>
                <button
                  onClick={handleExportarPlanPdf}
                  disabled={exportingPlanPdf}
                  style={{
                    ...S.calcBtn,
                    flex: 1,
                    background: '#c62828',
                    opacity: exportingPlanPdf ? 0.6 : 1,
                    cursor: exportingPlanPdf ? 'not-allowed' : 'pointer',
                  }}
                >
                  {exportingPlanPdf ? '⏳ Generando…' : '📄 PDF'}
                </button>
              </div>
              {pdfError && (
                <div style={{ fontSize: 10, color: '#c62828', marginTop: 4, padding: '3px 6px', background: '#ffebee', borderRadius: 3 }}>
                  ⚠️ {pdfError}
                </div>
              )}
            </div>
          )}

          <div style={S.footer}>
            <strong>v0.2.0</strong> · FertiPRO ×{' '}
            <a href="https://portal.api.itacyl.es" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Sativum (ITACyL)</a>
            {' '}· FertiliCalc (Villalobos et al. 2020) ·{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>CC BY 4.0</a>
            <br />
            Datos de suelo:{' '}
            <a href="https://suelos.itacyl.es" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>©Junta de Castilla y León (suelos.itacyl.es)</a>
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
  calcWrap: { padding: '4px 12px 8px' },
  calcBtn: {
    width: '100%', padding: '10px 0',
    background: '#1a237e', color: '#fff',
    border: 'none', borderRadius: 6,
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    letterSpacing: 0.3,
    transition: 'opacity 0.15s',
  },
  calcHint: { fontSize: 11, color: '#90a4ae', marginTop: 4, textAlign: 'center' },
}
