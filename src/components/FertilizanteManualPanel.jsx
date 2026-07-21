/**
 * src/components/FertilizanteManualPanel.jsx
 *
 * Panel para que el asesor añada su propia selección de fertilizantes.
 * Permite elegir del catálogo Sativum (1253 productos, carga lazy) o
 * introducir un producto personalizado (N%/P₂O₅%/K₂O% libres) vinculado
 * a un tipo de material fertilizante SIEX (RD 1051/2022).
 *
 * Props:
 *   planItems                — array unificado de aplicaciones { id, origen:'sativum'|'manual',
 *                              nombre, tipo, tipoSIEX, n, p2o5, k2o, cantidad,
 *                              fechaAplicacion, esPersonalizado }
 *   onChange(items)          — callback para actualizar el array completo en App.jsx
 *   npk                      — respuesta cruda /algo/ (para coverage bars)
 *   npkParaRec               — { n, p, k } neto (para necesidad en barras)
 *   nRiego / pRiego / kRiego — kg/ha cubiertos por riego
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getFertilizadores, getFertilizador, extractFertilizerId, pToOxide, kToOxide } from '../api/sativum-fertilizers'
import { TIPOS_MATERIAL_FERTILIZANTE } from '../data/sativum/tiposMaterialFertilizante'
import { calcNpkEfectivo } from '../utils/npkUtils'

// Categorías SIEX con mineralización anual (RD 1051/2022)
const ORGANIC_SIEX_CODES = new Set([1,2,3,4,5,6,7,8,10,13,15,16,19,20,21,22])

// ── helpers ───────────────────────────────────────────────────────────────────

function extraerFabricante(name = '') {
  // Los nombres convencionales siguen el patrón "fórmula NPK de FABRICANTE".
  // Los productos orgánicos tienen " de " dentro de la descripción, no como separador
  // de fabricante. Usamos lastIndexOf para encontrar el separador real, y descartamos
  // el candidato si contiene ')' (estaba dentro de paréntesis) o es muy largo.
  const idx = name.lastIndexOf(' de ')
  if (idx < 0) return 'GENÉRICO'
  const candidate = name.slice(idx + 4)
  if (candidate.includes(')') || candidate.length > 40) return 'GENÉRICO'
  return candidate
}

function uniq(arr) {
  return [...new Set(arr)].filter(Boolean).sort()
}

function fmt1(v) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toFixed(1)
}

function fmtFecha(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function extraerNPKNeed(npk, nRiego = 0) {
  if (!npk) return null
  const last = npk.recommendations?.at(-1)
  const n    = npk.n ?? last?.n ?? 0
  const p    = npk.p ?? last?.p ?? 0
  const k    = npk.k ?? last?.k ?? 0
  return {
    n:    (n ?? 0) + (nRiego ?? 0),
    p2o5: pToOxide(p ?? 0),
    k2o:  kToOxide(k ?? 0),
  }
}

// calcNpkEfectivo importada desde ../utils/npkUtils

function calcularAcumulado(items, fechaInicioCiclo) {
  return items.reduce(
    (acc, item) => {
      const { efN, efP2o5, efK2o } = calcNpkEfectivo(item, fechaInicioCiclo)
      return {
        n:    acc.n    + efN,
        p2o5: acc.p2o5 + efP2o5,
        k2o:  acc.k2o  + efK2o,
      }
    },
    { n: 0, p2o5: 0, k2o: 0 }
  )
}

// ── CoverageRow ───────────────────────────────────────────────────────────────

function CoverageRow({ label, aportado, necesidad }) {
  const pct   = necesidad > 0 ? Math.min(100, (aportado / necesidad) * 100) : 0
  const color = pct >= 100 ? '#2e7d32' : pct >= 70 ? '#e65100' : '#b71c1c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 3 }}>
      <span style={{ width: 34, fontWeight: 700, color: '#1a237e', flexShrink: 0 }}>{label}</span>
      <span style={{ width: 52, textAlign: 'right', fontFamily: 'monospace', color: '#263238', flexShrink: 0 }}>
        {fmt1(aportado)}
      </span>
      <span style={{ color: '#90a4ae', flexShrink: 0 }}>/</span>
      <span style={{ width: 52, textAlign: 'right', fontFamily: 'monospace', color: '#546e7a', flexShrink: 0 }}>
        {fmt1(necesidad)}
      </span>
      <div style={{ flex: 1, height: 8, background: '#eceff1', borderRadius: 4, overflow: 'hidden', minWidth: 30 }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color,
          borderRadius: 4, transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ width: 32, textAlign: 'right', fontWeight: 700, color, flexShrink: 0 }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

// ── FertilizanteManualPanel ───────────────────────────────────────────────────

export default function FertilizanteManualPanel({
  planItems        = [],
  onChange,
  npk              = null,
  npkParaRec       = null,
  nRiego           = 0,
  pRiego           = 0,   // eslint-disable-line no-unused-vars
  kRiego           = 0,   // eslint-disable-line no-unused-vars
  fechaInicioCiclo = null,
}) {
  // Alias para legibilidad interna (los items manuales son un subconjunto)
  const fertilizadoresManuales = planItems
  const [open, setOpen] = useState(false)

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const [catalogo,        setCatalogo]        = useState([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [errorCatalogo,   setErrorCatalogo]   = useState(null)

  // ── Tipo SIEX (primer selector) ───────────────────────────────────────────
  const [tipoSIEX, setTipoSIEX] = useState('')
  // Código numérico SIEX derivado del nombre seleccionado (para filtrar catálogo por materialSiexId)
  const tipoSIEXCodigo = useMemo(() =>
    TIPOS_MATERIAL_FERTILIZANTE.find(t => t.nombre === tipoSIEX)?.codigo ?? null
  , [tipoSIEX])

  // ── Filtro fabricante (segundo selector) ──────────────────────────────────
  const [fabricante, setFabricante] = useState('')

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  const [busqueda,      setBusqueda]      = useState('')
  const [busquedaDelay, setBusquedaDelay] = useState('')
  const busquedaRef = useRef(null)

  // ── Selección ─────────────────────────────────────────────────────────────
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [showSugerencias,      setShowSugerencias]      = useState(false)
  const [npCustom,             setNpCustom]             = useState({ n: '', p2o5: '', k2o: '' })

  // ── esPersonalizado es derived ────────────────────────────────────────────
  const esPersonalizado = productoSeleccionado?.esPersonalizado === true

  // ── Detalle fertilizante orgánico (fetch al seleccionar) ─────────────────
  const [detalleOrganico, setDetalleOrganico] = useState(null)
  const [loadingDetalle,  setLoadingDetalle]  = useState(false)

  // ── Entrada ───────────────────────────────────────────────────────────────
  const [cantidad,        setCantidad]        = useState('')
  const [fechaAplicacion, setFechaAplicacion] = useState('')

  // ── Carga lazy del catálogo ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || catalogo.length > 0 || loadingCatalogo) return
    setLoadingCatalogo(true)
    getFertilizadores()
      .then(data => {
        setCatalogo(data)
        if (data.length === 0) {
          setErrorCatalogo('El catálogo está vacío — prueba en modo Vercel.')
        }
      })
      .catch(() => {
        setErrorCatalogo('Catálogo no disponible. Selecciona el tipo SIEX y usa la opción PERSONALIZADO.')
      })
      .finally(() => setLoadingCatalogo(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce búsqueda ─────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(busquedaRef.current)
    busquedaRef.current = setTimeout(() => setBusquedaDelay(busqueda), 300)
    return () => clearTimeout(busquedaRef.current)
  }, [busqueda])

  // ── Auto-abrir dropdown al seleccionar fabricante ─────────────────────────
  useEffect(() => {
    if (fabricante) setShowSugerencias(true)
  }, [fabricante])

  // ── Reset al cambiar tipoSIEX ─────────────────────────────────────────────
  useEffect(() => {
    setProductoSeleccionado(null)
    setNpCustom({ n: '', p2o5: '', k2o: '' })
    setFabricante('')   // reset fabricante al cambiar categoría
    setBusqueda('')
    setBusquedaDelay('')
    setDetalleOrganico(null)
  }, [tipoSIEX]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────

  // Subconjunto del catálogo para la categoría SIEX seleccionada
  const catalogoFiltradoSiex = useMemo(() => {
    if (tipoSIEXCodigo == null) return catalogo
    return catalogo.filter(f => f.materialSiexId === tipoSIEXCodigo)
  }, [catalogo, tipoSIEXCodigo])

  // Fabricantes solo del subconjunto SIEX (sin duplicados)
  const fabricantes = useMemo(() => {
    return uniq(catalogoFiltradoSiex.map(f => extraerFabricante(f.name)))
  }, [catalogoFiltradoSiex])

  const sugerencias = useMemo(() => {
    // Partir siempre del subconjunto filtrado por SIEX
    let items = catalogoFiltradoSiex
    // Filtro fabricante
    if (fabricante) items = items.filter(f => extraerFabricante(f.name) === fabricante)
    // Filtro texto (1 carácter mínimo); sin texto y sin fabricante = lista vacía (demasiados items)
    if (busquedaDelay.length >= 1) {
      const q = busquedaDelay.toLowerCase()
      items = items.filter(f => f.name.toLowerCase().includes(q))
    } else if (!fabricante) {
      items = []   // sin texto ni fabricante, no mostramos todo el catálogo
    }
    const result = items.slice(0, 20)
    if (tipoSIEX) result.unshift({ esPersonalizado: true, _sentinel: true })
    return result
  }, [catalogoFiltradoSiex, fabricante, busquedaDelay, tipoSIEX])

  const npkNeed = useMemo(() => {
    // npkParaRec ya tiene descontado el aporte del riego (N/P/K, todo client-side — ver App.jsx)
    if (npkParaRec) {
      return {
        n:    npkParaRec.n ?? 0,
        p2o5: pToOxide(npkParaRec.p ?? 0),
        k2o:  kToOxide(npkParaRec.k ?? 0),
      }
    }
    return extraerNPKNeed(npk, nRiego)
  }, [npkParaRec, npk, nRiego])
  const acumulado = useMemo(() => calcularAcumulado(planItems, fechaInicioCiclo), [planItems, fechaInicioCiclo])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAnadir = useCallback(() => {
    const dosis = Number(cantidad)
    if (!dosis || dosis <= 0) return
    if (!esPersonalizado && !productoSeleccionado) return
    if (esPersonalizado && !npCustom.n && !npCustom.p2o5 && !npCustom.k2o) return

    const item = esPersonalizado
      ? {
          id:              Date.now(),
          origen:          'manual',
          nombre:          `Personalizado — ${tipoSIEX}`,
          tipo:            tipoSIEX,
          tipoSIEX:        tipoSIEX,
          n:               Number(npCustom.n)    || 0,
          p2o5:            Number(npCustom.p2o5) || 0,
          k2o:             Number(npCustom.k2o)  || 0,
          cantidad:        dosis,
          fechaAplicacion: fechaAplicacion || null,
          esPersonalizado: true,
          // Mineralización orgánica: poblada cuando el tipo SIEX es orgánico
          // (obtenida del producto PERSONALIZADO del catálogo Sativum al seleccionar)
          appliesAnnualEffectiveness: detalleOrganico?.appliesAnnualEffectiveness ?? false,
          yearPercent0: detalleOrganico?.yearPercent0 ?? null,
          yearPercent1: detalleOrganico?.yearPercent1 ?? null,
          yearPercent2: detalleOrganico?.yearPercent2 ?? null,
        }
      : {
          id:              Date.now(),
          origen:          'manual',
          nombre:          productoSeleccionado.name,
          tipo:            productoSeleccionado.type ?? '',
          tipoSIEX:        tipoSIEX || null,
          n:               productoSeleccionado.n    ?? 0,
          p2o5:            productoSeleccionado.p2o5 ?? 0,
          k2o:             productoSeleccionado.k2o  ?? 0,
          cantidad:        dosis,
          fechaAplicacion: fechaAplicacion || null,
          esPersonalizado: false,
          // Campos mineralización orgánica (null si no aplica)
          appliesAnnualEffectiveness: detalleOrganico?.appliesAnnualEffectiveness ?? false,
          yearPercent0: detalleOrganico?.yearPercent0 ?? null,
          yearPercent1: detalleOrganico?.yearPercent1 ?? null,
          yearPercent2: detalleOrganico?.yearPercent2 ?? null,
        }

    onChange([...planItems, item])
    // Reset formulario (tipoSIEX se mantiene para añadir más del mismo tipo)
    setProductoSeleccionado(null)
    setBusqueda('')
    setBusquedaDelay('')
    setCantidad('')
    setFechaAplicacion('')
    setNpCustom({ n: '', p2o5: '', k2o: '' })
    setShowSugerencias(false)
    setDetalleOrganico(null)
  }, [cantidad, esPersonalizado, productoSeleccionado, npCustom, fechaAplicacion,
      tipoSIEX, fertilizadoresManuales, detalleOrganico, onChange])

  const handleEliminar = useCallback(id => {
    onChange(planItems.filter(f => f.id !== id))
  }, [planItems, onChange])

  const canAnadir =
    Number(cantidad) > 0 &&
    (esPersonalizado
      ? (!!npCustom.n || !!npCustom.p2o5 || !!npCustom.k2o)
      : !!productoSeleccionado)

  const nItems       = planItems.length
  const nItemsManual = planItems.filter(i => i.origen === 'manual').length
  // Todos los items ordenados por fecha (sin fecha al final)
  const itemsOrdenados = useMemo(() => [...planItems].sort((a, b) => {
    if (!a.fechaAplicacion && !b.fechaAplicacion) return 0
    if (!a.fechaAplicacion) return 1
    if (!b.fechaAplicacion) return -1
    return a.fechaAplicacion.localeCompare(b.fechaAplicacion)
  }), [planItems])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>

      {/* ── Cabecera colapsable ── */}
      <button type="button" onClick={() => setOpen(o => !o)} style={S.header}>
        <span style={S.headerLabel}>
          <span style={{ fontSize: 13 }}>🌱</span>
          Recomendación asesor
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {nItemsManual > 0 && (
            <span style={S.badge}>{nItemsManual} asesor{nItemsManual !== 1 ? '' : ''}</span>
          )}
          <span style={{ color: '#90a4ae', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={S.body}>

          {/* ── Selector tipo SIEX ── */}
          <div style={{ marginBottom: 8 }}>
            <label style={S.smallLabel}>Tipo material fertilizante (SIEX)</label>
            <select
              value={tipoSIEX}
              onChange={e => setTipoSIEX(e.target.value)}
              style={{ ...S.select, width: '100%' }}
            >
              <option value="">— Selecciona tipo —</option>
              {TIPOS_MATERIAL_FERTILIZANTE.map(t => (
                <option key={t.codigo} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* ── Sección catálogo (solo si tipoSIEX seleccionado) ── */}
          {tipoSIEX && (
            <>
              {loadingCatalogo && <div style={S.hint}>Cargando catálogo Sativum…</div>}
              {errorCatalogo   && <div style={S.hintWarn}>{errorCatalogo}</div>}

              {/* Filtro fabricante */}
              {catalogo.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <label style={S.smallLabel}>Fabricante</label>
                  <select
                    value={fabricante}
                    onChange={e => setFabricante(e.target.value)}
                    style={{ ...S.select, width: '100%' }}
                  >
                    <option value="">Todos los fabricantes</option>
                    {fabricantes.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}

              {/* Producto seleccionado o combobox búsqueda */}
              {productoSeleccionado ? (
                esPersonalizado ? (
                  /* ── Display PERSONALIZADO seleccionado ── */
                  <div style={{ ...S.productoSelected, background: '#f3e5f5', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...S.productoName, color: '#4a148c' }}>
                        PERSONALIZADO: {tipoSIEX}
                      </div>
                      <div style={{ ...S.productoNpk, color: '#7b1fa2' }}>
                        Introduce N%, P₂O₅%, K₂O% abajo
                      </div>
                      {loadingDetalle && (
                        <div style={{ fontSize: 9, color: '#78909c', fontStyle: 'italic', marginTop: 2 }}>
                          Consultando mineralización…
                        </div>
                      )}
                      {!loadingDetalle && detalleOrganico?.appliesAnnualEffectiveness && (
                        <div style={{ fontSize: 9, color: '#ef6c00', marginTop: 2 }}>
                          🌿 Orgánico — mineral. año 0: {detalleOrganico.yearPercent0}% · año 1: {detalleOrganico.yearPercent1}% · año 2: {detalleOrganico.yearPercent2}%
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProductoSeleccionado(null); setBusqueda(''); setBusquedaDelay(''); setDetalleOrganico(null) }}
                      style={S.clearBtn}
                    >×</button>
                  </div>
                ) : (
                  /* ── Display producto catálogo seleccionado ── */
                  <div style={{ ...S.productoSelected, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.productoName}>{productoSeleccionado.name}</div>
                      <div style={S.productoNpk}>
                        N {productoSeleccionado.n}% · P₂O₅ {productoSeleccionado.p2o5}% · K₂O {productoSeleccionado.k2o}%
                        {' · '}{productoSeleccionado.type}
                      </div>
                      {loadingDetalle && (
                        <div style={{ fontSize: 9, color: '#78909c', fontStyle: 'italic', marginTop: 2 }}>
                          Consultando mineralización…
                        </div>
                      )}
                      {!loadingDetalle && detalleOrganico?.appliesAnnualEffectiveness && (
                        <div style={{ fontSize: 9, color: '#ef6c00', marginTop: 2 }}>
                          🌿 Orgánico — mineral. año 0: {detalleOrganico.yearPercent0}% · año 1: {detalleOrganico.yearPercent1}% · año 2: {detalleOrganico.yearPercent2}%
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProductoSeleccionado(null); setBusqueda(''); setBusquedaDelay(''); setDetalleOrganico(null) }}
                      style={S.clearBtn}
                    >×</button>
                  </div>
                )
              ) : (
                /* ── Combobox búsqueda ── */
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <label style={S.smallLabel}>PRODUCTO FERTILIZANTE</label>
                  <input
                    type="text"
                    value={busqueda}
                    placeholder={
                      fabricante
                        ? 'Buscar en la lista o deja vacío para ver todos…'
                        : 'Escribe para buscar o selecciona un fabricante primero…'
                    }
                    onChange={e => { setBusqueda(e.target.value); setShowSugerencias(true) }}
                    onFocus={() => setShowSugerencias(true)}
                    onBlur={() => setTimeout(() => setShowSugerencias(false), 150)}
                    style={S.input}
                  />
                  {showSugerencias && sugerencias.length > 0 && (
                    <div style={S.dropdown}>
                      {sugerencias.map((f, idx) =>
                        f._sentinel ? (
                          /* ── Opción PERSONALIZADO en morado ── */
                          <div
                            key="__personalizado__"
                            style={S.dropdownItemPersonalizado}
                            onMouseDown={e => {
                              e.preventDefault()
                              setProductoSeleccionado({ esPersonalizado: true })
                              setBusqueda('')
                              setBusquedaDelay('')
                              setShowSugerencias(false)
                              // Para SIEX orgánicos: fetch del producto PERSONALIZADO del catálogo
                              // para obtener yearPercent0/1/2 y appliesAnnualEffectiveness
                              setDetalleOrganico(null)
                              if (ORGANIC_SIEX_CODES.has(tipoSIEXCodigo)) {
                                const personalItem = catalogoFiltradoSiex.find(
                                  x => x.name?.toUpperCase().startsWith('PERSONALIZADO')
                                )
                                if (personalItem) {
                                  const fid = extractFertilizerId(personalItem)
                                  if (fid) {
                                    setLoadingDetalle(true)
                                    getFertilizador(fid)
                                      .then(d => setDetalleOrganico(d))
                                      .finally(() => setLoadingDetalle(false))
                                  }
                                }
                              }
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 11, color: '#4a148c' }}>
                              PERSONALIZADO: {tipoSIEX}
                            </div>
                            <div style={{ fontSize: 9, color: '#7b1fa2' }}>
                              Introduce la composición manualmente
                            </div>
                          </div>
                        ) : (
                          <div
                            key={f.name ?? idx}
                            style={S.dropdownItem}
                            onMouseDown={e => {
                              e.preventDefault()
                              setProductoSeleccionado(f)
                              setBusqueda(f.name)
                              setShowSugerencias(false)
                              // Fetch detalle si es categoría orgánica (para yearPercent)
                              setDetalleOrganico(null)
                              if (ORGANIC_SIEX_CODES.has(f.materialSiexId)) {
                                const fid = extractFertilizerId(f)
                                if (fid) {
                                  setLoadingDetalle(true)
                                  getFertilizador(fid)
                                    .then(d => setDetalleOrganico(d))
                                    .finally(() => setLoadingDetalle(false))
                                }
                              }
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 11, color: '#263238' }}>{f.name}</div>
                            <div style={{ fontSize: 9, color: '#78909c' }}>
                              N {f.n}% · P₂O₅ {f.p2o5}% · K₂O {f.k2o}%
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Inputs composición personalizado ── */}
          {esPersonalizado && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {[
                { key: 'n',    label: 'N %' },
                { key: 'p2o5', label: 'P₂O₅ %' },
                { key: 'k2o',  label: 'K₂O %' },
              ].map(({ key, label }) => (
                <div key={key} style={{ flex: 1 }}>
                  <label style={S.smallLabel}>{label}</label>
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={npCustom[key]}
                    onChange={e => setNpCustom(prev => ({ ...prev, [key]: e.target.value }))}
                    style={S.inputNum}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Dosis + Fecha (solo si tipoSIEX seleccionado) ── */}
          {tipoSIEX && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={S.smallLabel}>Dosis kg/ha *</label>
                <input
                  type="number" min={0} step={1}
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  placeholder="0"
                  style={S.inputNum}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.smallLabel}>Fecha aplic.</label>
                <input
                  type="date"
                  value={fechaAplicacion}
                  onChange={e => setFechaAplicacion(e.target.value)}
                  style={S.input}
                />
              </div>
            </div>
          )}

          {/* ── Botón añadir ── */}
          {tipoSIEX && (
            <button
              type="button"
              onClick={handleAnadir}
              disabled={!canAnadir}
              style={{ ...S.btnAnadir, opacity: canAnadir ? 1 : 0.45, cursor: canAnadir ? 'pointer' : 'not-allowed' }}
            >
              + Añadir al plan
            </button>
          )}


        </div>
      )}

      {/* ── Tabla de items del plan y Calculado vs Planificado — este último ya no depende
          de tener productos añadidos, solo de que haya necesidad calculada (npkNeed) ── */}
      {(nItems > 0 || npkNeed) && (
        <div style={{ padding: '0 12px 10px' }}>
          {nItems > 0 && (
            <>
              <div style={S.sectionLabel}>
                Plan de aplicaciones
                <span style={{ fontWeight: 400, color: '#90a4ae', marginLeft: 6, fontSize: 9 }}>
                  {nItems} producto{nItems !== 1 ? 's' : ''}
                </span>
              </div>
              {itemsOrdenados.map(item => {
                const dose = Number(item.cantidad) || 0
                const ef   = calcNpkEfectivo(item, fechaInicioCiclo)
                return (
                  <div key={item.id} style={S.itemRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 4 }}>
                        <div style={S.itemNombre}>{item.nombre}</div>
                        <div style={S.itemMeta}>
                          {item.origen === 'sativum'
                            ? <span style={S.sativumBadge}>Sativum</span>
                            : <span style={S.manualBadge}>Asesor</span>
                          }
                          {item.fechaAplicacion ? fmtFecha(item.fechaAplicacion) + ' · ' : ''}
                          <strong>{Number(dose).toFixed(0)} kg/ha</strong>
                          {item.tipoSIEX && (
                            <span style={item.esPersonalizado ? S.custBadgePurple : S.custBadge}>
                              {item.tipoSIEX}
                            </span>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleEliminar(item.id)} style={S.deletBtn}>×</button>
                    </div>
                    <div style={S.itemNpk}>
                      N <strong>{fmt1(ef.brutoN)}</strong>
                      {' · '}P₂O₅ <strong>{fmt1(ef.brutoP2o5)}</strong>
                      {' · '}K₂O <strong>{fmt1(ef.brutoK2o)}</strong> kg/ha
                      {ef.esOrganico && (
                        <div style={{ color: '#ef6c00', fontSize: 9, marginTop: 2 }}>
                          🌿 efectivo este ciclo ({ef.pct}%): N {fmt1(ef.efN)} · P₂O₅ {fmt1(ef.efP2o5)} · K₂O {fmt1(ef.efK2o)} kg/ha
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ── Cobertura acumulada — visible en cuanto hay necesidad calculada,
              sin depender de que se haya añadido ningún producto al plan ── */}
          {npkNeed && (
            <div style={S.coverageWrap}>
              <div style={{ ...S.sectionLabel, marginBottom: 5 }}>Calculado vs Planificado</div>
              <div style={{ display: 'flex', fontSize: 9, color: '#90a4ae', marginBottom: 4, gap: 4 }}>
                <span style={{ width: 34 }} />
                <span style={{ width: 52, textAlign: 'right' }}>Aportado</span>
                <span />
                <span style={{ width: 52, textAlign: 'right' }}>Necesidad</span>
                <span style={{ flex: 1 }} />
                <span style={{ width: 32, textAlign: 'right' }}>%</span>
              </div>
              <CoverageRow label="N"     aportado={acumulado.n}    necesidad={npkNeed.n}    />
              <CoverageRow label="P₂O₅" aportado={acumulado.p2o5} necesidad={npkNeed.p2o5} />
              <CoverageRow label="K₂O"  aportado={acumulado.k2o}  necesidad={npkNeed.k2o}  />
              <div style={{ fontSize: 9, color: '#b0bec5', marginTop: 4 }}>
                kg/ha · Necesidad neta = necesidades del cultivo descontado el riego
                {planItems.some(i => i.appliesAnnualEffectiveness) && (
                  <span style={{ color: '#ef6c00' }}> · 🌿 Orgánicos: fracción mineralizable este ciclo</span>
                )}
              </div>
            </div>
          )}

          {/* Botón limpiar todo */}
          {nItems > 0 && (
            <button
              type="button"
              style={S.clearAllBtn}
              onClick={() => onChange([])}
            >
              Limpiar plan
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── estilos ───────────────────────────────────────────────────────────────────

const S = {
  wrap: {
    borderTop: '1px solid #eceff1',
    background: '#fff',
  },
  header: {
    width: '100%', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '9px 12px',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  },
  headerLabel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  badge: {
    fontSize: 10, color: '#1b5e20', background: '#e8f5e9',
    borderRadius: 3, padding: '1px 5px',
  },
  body: {
    padding: '4px 12px 14px',
  },
  hint: {
    fontSize: 11, color: '#78909c', padding: '4px 0', marginBottom: 4,
    fontStyle: 'italic',
  },
  hintWarn: {
    fontSize: 10, color: '#e65100', background: '#fff3e0',
    borderRadius: 3, padding: '5px 7px', marginBottom: 6,
  },
  select: {
    padding: '4px 5px', fontSize: 11,
    border: '1px solid #cfd8dc', borderRadius: 4,
    fontFamily: 'inherit', color: '#263238', background: '#fff',
    boxSizing: 'border-box',
  },
  input: {
    width: '100%', padding: '4px 6px', fontSize: 11,
    border: '1px solid #cfd8dc', borderRadius: 4,
    fontFamily: 'inherit', color: '#263238',
    boxSizing: 'border-box',
  },
  inputNum: {
    width: '100%', padding: '4px 6px', fontSize: 11,
    border: '1px solid #cfd8dc', borderRadius: 4,
    fontFamily: 'monospace', color: '#263238', textAlign: 'right',
    boxSizing: 'border-box',
  },
  smallLabel: {
    fontSize: 9, color: '#78909c', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.3,
    display: 'block', marginBottom: 2,
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
    background: '#fff', border: '1px solid #cfd8dc', borderRadius: 4,
    boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
    maxHeight: 210, overflowY: 'auto',
  },
  dropdownItem: {
    padding: '5px 8px', cursor: 'pointer',
    borderBottom: '1px solid #f5f5f5',
  },
  dropdownItemPersonalizado: {
    padding: '6px 8px', cursor: 'pointer',
    borderBottom: '1px solid #e1bee7',
    background: '#fce4ec',
  },
  productoSelected: {
    display: 'flex', alignItems: 'center',
    background: '#e8eaf6', borderRadius: 4, padding: '5px 8px',
    gap: 6,
  },
  productoName: {
    fontWeight: 700, fontSize: 11, color: '#1a237e',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  productoNpk: {
    fontSize: 9, color: '#5c6bc0', marginTop: 1,
  },
  clearBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#78909c', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0,
  },
  btnAnadir: {
    width: '100%', padding: '7px 0',
    background: '#1a237e', color: '#fff',
    border: 'none', borderRadius: 4,
    fontSize: 12, fontWeight: 600,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', marginBottom: 5,
  },
  itemRow: {
    padding: '6px 8px', marginBottom: 5,
    background: '#f8f9fa', borderRadius: 4,
    border: '1px solid #e8eaf6',
  },
  itemNombre: {
    fontSize: 11, fontWeight: 700, color: '#263238',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemMeta: {
    fontSize: 10, color: '#78909c', marginTop: 1,
    display: 'flex', alignItems: 'center', gap: 5,
  },
  custBadge: {
    fontSize: 8, color: '#1a237e', background: '#e8eaf6',
    borderRadius: 3, padding: '1px 4px',
    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  custBadgePurple: {
    fontSize: 8, color: '#4a148c', background: '#f3e5f5',
    borderRadius: 3, padding: '1px 4px',
    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  sativumBadge: {
    fontSize: 8, fontWeight: 700, color: '#0d47a1', background: '#bbdefb',
    borderRadius: 3, padding: '1px 5px',
  },
  manualBadge: {
    fontSize: 8, fontWeight: 700, color: '#1b5e20', background: '#c8e6c9',
    borderRadius: 3, padding: '1px 5px',
  },
  itemNpk: {
    fontSize: 10, color: '#546e7a', marginTop: 4,
  },
  deletBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#ef9a9a', fontSize: 17, lineHeight: 1,
    padding: '0 2px', flexShrink: 0,
  },
  coverageWrap: {
    marginTop: 8, padding: '8px 10px',
    background: '#f5f7fa', borderRadius: 4,
    border: '1px solid #e0e6ed',
  },
  clearAllBtn: {
    marginTop: 8, fontSize: 10, color: '#90a4ae',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: 0, textDecoration: 'underline', display: 'block',
  },
}
