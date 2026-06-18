/**
 * src/components/FertilizanteManualPanel.jsx
 *
 * Panel para que el asesor añada su propia selección de fertilizantes.
 * Permite elegir del catálogo Sativum (1253 productos, carga lazy) o
 * introducir un producto personalizado (N%/P₂O₅%/K₂O% libres) vinculado
 * a un tipo de material fertilizante SIEX (RD 1051/2022).
 *
 * Props:
 *   fertilizadoresManuales   — array de items { id, nombre, tipo, tipoSIEX,
 *                              n, p2o5, k2o, cantidad, fechaAplicacion, esPersonalizado }
 *   onChange(items)          — callback para actualizar el array en App.jsx
 *   npk                      — respuesta cruda /algo/ (para coverage bars)
 *   nRiego / pRiego / kRiego — kg/ha cubiertos por riego (para necesidad bruta)
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getFertilizadores, pToOxide, kToOxide } from '../api/sativum-fertilizers'
import { TIPOS_MATERIAL_FERTILIZANTE } from '../data/sativum/tiposMaterialFertilizante'

// ── helpers ───────────────────────────────────────────────────────────────────

function extraerFabricante(name = '') {
  const idx = name.indexOf(' de ')
  return idx >= 0 ? name.slice(idx + 4) : 'GENÉRICO'
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

function calcularAcumulado(items) {
  return items.reduce(
    (acc, item) => {
      const dose = Number(item.cantidad) || 0
      return {
        n:    acc.n    + ((item.n    ?? 0) * dose / 100),
        p2o5: acc.p2o5 + ((item.p2o5 ?? 0) * dose / 100),
        k2o:  acc.k2o  + ((item.k2o  ?? 0) * dose / 100),
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
  fertilizadoresManuales = [],
  onChange,
  npk        = null,
  nRiego     = 0,
  pRiego     = 0,   // eslint-disable-line no-unused-vars
  kRiego     = 0,   // eslint-disable-line no-unused-vars
}) {
  const [open, setOpen] = useState(false)

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const [catalogo,        setCatalogo]        = useState([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [errorCatalogo,   setErrorCatalogo]   = useState(null)

  // ── Tipo SIEX (primer selector) ───────────────────────────────────────────
  const [tipoSIEX, setTipoSIEX] = useState('')

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

  // ── Reset al cambiar tipoSIEX ─────────────────────────────────────────────
  useEffect(() => {
    if (productoSeleccionado?.esPersonalizado) {
      setProductoSeleccionado(null)
      setNpCustom({ n: '', p2o5: '', k2o: '' })
    }
    setBusqueda('')
    setBusquedaDelay('')
  }, [tipoSIEX]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────
  const fabricantes = useMemo(() => {
    return uniq(catalogo.map(f => extraerFabricante(f.name)))
  }, [catalogo])

  const sugerencias = useMemo(() => {
    let items = catalogo
    if (fabricante) items = items.filter(f => extraerFabricante(f.name) === fabricante)
    if (busquedaDelay.length >= 2) {
      const q = busquedaDelay.toLowerCase()
      items = items.filter(f => f.name.toLowerCase().includes(q))
    } else {
      items = [] // sin texto no mostramos las 1253 opciones
    }
    const result = items.slice(0, 15)
    if (tipoSIEX) result.unshift({ esPersonalizado: true, _sentinel: true })
    return result
  }, [catalogo, fabricante, busquedaDelay, tipoSIEX])

  const npkNeed   = useMemo(() => extraerNPKNeed(npk, nRiego), [npk, nRiego])
  const acumulado = useMemo(() => calcularAcumulado(fertilizadoresManuales), [fertilizadoresManuales])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAnadir = useCallback(() => {
    const dosis = Number(cantidad)
    if (!dosis || dosis <= 0) return
    if (!esPersonalizado && !productoSeleccionado) return
    if (esPersonalizado && !npCustom.n && !npCustom.p2o5 && !npCustom.k2o) return

    const item = esPersonalizado
      ? {
          id:              Date.now(),
          nombre:          `Personalizado — ${tipoSIEX}`,
          tipo:            tipoSIEX,
          tipoSIEX:        tipoSIEX,
          n:               Number(npCustom.n)    || 0,
          p2o5:            Number(npCustom.p2o5) || 0,
          k2o:             Number(npCustom.k2o)  || 0,
          cantidad:        dosis,
          fechaAplicacion: fechaAplicacion || null,
          esPersonalizado: true,
        }
      : {
          id:              Date.now(),
          nombre:          productoSeleccionado.name,
          tipo:            productoSeleccionado.type ?? '',
          tipoSIEX:        tipoSIEX || null,
          n:               productoSeleccionado.n    ?? 0,
          p2o5:            productoSeleccionado.p2o5 ?? 0,
          k2o:             productoSeleccionado.k2o  ?? 0,
          cantidad:        dosis,
          fechaAplicacion: fechaAplicacion || null,
          esPersonalizado: false,
        }

    onChange([...fertilizadoresManuales, item])
    // Reset formulario (tipoSIEX se mantiene para añadir más del mismo tipo)
    setProductoSeleccionado(null)
    setBusqueda('')
    setBusquedaDelay('')
    setCantidad('')
    setFechaAplicacion('')
    setNpCustom({ n: '', p2o5: '', k2o: '' })
    setShowSugerencias(false)
  }, [cantidad, esPersonalizado, productoSeleccionado, npCustom, fechaAplicacion,
      tipoSIEX, fertilizadoresManuales, onChange])

  const handleEliminar = useCallback(id => {
    onChange(fertilizadoresManuales.filter(f => f.id !== id))
  }, [fertilizadoresManuales, onChange])

  const canAnadir =
    Number(cantidad) > 0 &&
    (esPersonalizado
      ? (!!npCustom.n || !!npCustom.p2o5 || !!npCustom.k2o)
      : !!productoSeleccionado)

  const nItems = fertilizadoresManuales.length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>

      {/* ── Cabecera colapsable ── */}
      <button type="button" onClick={() => setOpen(o => !o)} style={S.header}>
        <span style={S.headerLabel}>
          <span style={{ fontSize: 13 }}>🌱</span>
          Recomendación personalizada
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {nItems > 0 && (
            <span style={S.badge}>{nItems} producto{nItems !== 1 ? 's' : ''}</span>
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
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProductoSeleccionado(null); setBusqueda(''); setBusquedaDelay('') }}
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
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProductoSeleccionado(null); setBusqueda(''); setBusquedaDelay('') }}
                      style={S.clearBtn}
                    >×</button>
                  </div>
                )
              ) : (
                /* ── Combobox búsqueda ── */
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <input
                    type="text"
                    value={busqueda}
                    placeholder={
                      catalogo.length > 0
                        ? 'Buscar fertilizante (mín. 2 caracteres)…'
                        : 'Escribe para buscar o usa la opción PERSONALIZADO'
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

          {/* ── Tabla de items añadidos ── */}
          {nItems > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={S.sectionLabel}>Selección del asesor</div>
              {fertilizadoresManuales.map(item => {
                const dose = Number(item.cantidad) || 0
                const aN    = (item.n    ?? 0) * dose / 100
                const aP2o5 = (item.p2o5 ?? 0) * dose / 100
                const aK2o  = (item.k2o  ?? 0) * dose / 100
                return (
                  <div key={item.id} style={S.itemRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 4 }}>
                        <div style={S.itemNombre}>{item.nombre}</div>
                        <div style={S.itemMeta}>
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
                      N <strong>{fmt1(aN)}</strong>
                      {' · '}P₂O₅ <strong>{fmt1(aP2o5)}</strong>
                      {' · '}K₂O <strong>{fmt1(aK2o)}</strong> kg/ha
                    </div>
                  </div>
                )
              })}

              {/* ── Cobertura acumulada ── */}
              {npkNeed && (
                <div style={S.coverageWrap}>
                  <div style={{ ...S.sectionLabel, marginBottom: 5 }}>Cobertura acumulada</div>
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
                    kg/ha · Necesidad = necesidades brutas del cultivo (incluye riego)
                  </div>
                </div>
              )}

              {/* Botón limpiar todo */}
              <button
                type="button"
                style={S.clearAllBtn}
                onClick={() => onChange([])}
              >
                Limpiar selección
              </button>
            </div>
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
