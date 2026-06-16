/**
 * src/cultivos/CultivoSelector.jsx
 *
 * Selector de cultivo con búsqueda incremental sobre el catálogo Sativum.
 * Sustituye el <select> nativo por un combobox: input de texto + dropdown filtrado.
 *
 * Props:
 *   value    — name del cultivo seleccionado (string) o null
 *   onChange — callback(cultivo) → recibe el objeto completo de Sativum o null
 */
import { useEffect, useRef, useState } from 'react'
import { getCultivos, agruparPorGrupo, tieneRendimientoAnomalo } from '../api/sativum-crops'

const GRUPO_LABEL = {
  CEREALS:                 'Cereales',
  FORAGE_NON_LEGUME:       'Forrajes no leguminosos',
  FORAGE_LEGUME:           'Forrajes leguminosos',
  FORAGE_MIX_LEGUME_GRASS: 'Mezclas forrajeras',
  INDUSTRIAL:              'Cultivos industriales',
  PULSES:                  'Leguminosas grano',
  HORTICULTURAL:           'Hortícolas',
  TUBERS_ROOT:             'Tubérculos y raíces',
  TREES:                   'Leñosos',
  OTHER:                   'Otros',
}

function grupoLabel(grupo) {
  return GRUPO_LABEL[grupo?.toUpperCase()] ?? grupo
}

export default function CultivoSelector({ value, onChange }) {
  const [allCultivos, setAllCultivos] = useState([])
  const [grupos,      setGrupos]      = useState(new Map())
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [query,       setQuery]       = useState('')
  const [open,        setOpen]        = useState(false)
  const wrapRef   = useRef(null)
  const inputRef  = useRef(null)

  // ── Carga catálogo ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    getCultivos()
      .then(lista => {
        if (cancelled) return
        setAllCultivos(lista)
        setGrupos(agruparPorGrupo(lista))
        setLoading(false)
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  // Sincronizar input cuando el valor cambia desde fuera
  useEffect(() => {
    setQuery(value ?? '')
  }, [value])

  // Cerrar dropdown al clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Lógica de filtrado ──────────────────────────────────────────────────────
  const q = query.trim().toLowerCase()
  // Si el query coincide exactamente con el valor seleccionado → no filtrar
  const isSelected = value && query === value
  const filteredGrupos = []
  for (const [grupo, cultivos] of grupos.entries()) {
    const matching = (!q || isSelected)
      ? cultivos
      : cultivos.filter(c => c.name.toLowerCase().includes(q))
    if (matching.length) filteredGrupos.push([grupo, matching])
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelect = (cultivo) => {
    onChange?.(cultivo)
    setQuery(cultivo.name)
    setOpen(false)
  }

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange?.(null)
  }

  const handleFocus = () => setOpen(true)

  const handleClear = () => {
    onChange?.(null)
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <div style={S.placeholder}>Cargando catálogo Sativum…</div>
  if (error)   return <div style={{ ...S.placeholder, color: '#c62828' }}>⚠️ {error}</div>

  const total = allCultivos.length

  return (
    <div ref={wrapRef} style={S.wrap}>
      <label style={S.label}>
        Cultivo
        <span style={S.count}>{total} disponibles</span>
      </label>

      {/* Input con botón limpiar */}
      <div style={S.inputWrap}>
        <span style={S.searchIcon}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Buscar cultivo…"
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          style={S.input}
          autoComplete="off"
        />
        {(query || value) && (
          <button onClick={handleClear} style={S.clearBtn} title="Limpiar selección">×</button>
        )}
      </div>

      {/* Etiqueta de selección activa */}
      {value && !open && (
        <div style={S.selectedBadge}>
          ✓ {value}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div style={S.dropdown}>
          {filteredGrupos.length === 0 ? (
            <div style={S.noResults}>Sin resultados para «{query}»</div>
          ) : (
            filteredGrupos.map(([grupo, cultivos]) => (
              <div key={grupo}>
                <div style={S.groupHeader}>{grupoLabel(grupo)}</div>
                {cultivos.map(c => {
                  const activo = c.name === value
                  return (
                    <div
                      key={c.id}
                      onMouseDown={() => handleSelect(c)}
                      style={{
                        ...S.item,
                        background:  activo ? '#e8eaf6' : undefined,
                        fontWeight:  activo ? 600 : 400,
                        color:       activo ? '#1a237e' : '#263238',
                      }}
                    >
                      <span style={S.itemName}>{c.name}</span>
                      <span style={S.itemMeta}>
                        {c.nfixCode ? '🌿' : ''}
                        {tieneRendimientoAnomalo(c) ? ' ⚠️' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────────────

const S = {
  wrap: { position: 'relative' },
  label: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    fontSize: 12, fontWeight: 600, color: '#37474f', marginBottom: 4,
  },
  count: { fontWeight: 400, fontSize: 11, color: '#90a4ae' },

  inputWrap: {
    display: 'flex', alignItems: 'center',
    border: '1px solid #cfd8dc', borderRadius: 4,
    background: '#fff', overflow: 'hidden',
  },
  searchIcon: {
    fontSize: 12, padding: '0 6px',
    color: '#90a4ae', userSelect: 'none', flexShrink: 0,
  },
  input: {
    flex: 1, padding: '7px 4px',
    border: 'none', outline: 'none',
    fontSize: 13, fontFamily: 'inherit', color: '#263238',
    background: 'transparent',
  },
  clearBtn: {
    flexShrink: 0, width: 24, height: 24,
    border: 'none', background: 'none',
    fontSize: 16, color: '#90a4ae', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },

  selectedBadge: {
    marginTop: 4, fontSize: 11, color: '#1a237e',
    background: '#e8eaf6', border: '1px solid #c5cae9',
    borderRadius: 4, padding: '2px 8px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  dropdown: {
    position: 'absolute', zIndex: 999,
    top: 'calc(100% + 2px)', left: 0, right: 0,
    background: '#fff',
    border: '1px solid #cfd8dc', borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    maxHeight: 280, overflowY: 'auto',
  },
  groupHeader: {
    padding: '5px 10px 3px',
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#78909c',
    background: '#f5f7fa', borderBottom: '1px solid #eceff1',
    position: 'sticky', top: 0,
  },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 12px',
    fontSize: 12, cursor: 'pointer',
    borderBottom: '1px solid #f5f7fa',
    transition: 'background 0.1s',
  },
  itemName: { flex: 1 },
  itemMeta: { fontSize: 11, color: '#90a4ae', marginLeft: 6, flexShrink: 0 },
  noResults: {
    padding: '12px', fontSize: 12, color: '#90a4ae',
    textAlign: 'center', fontStyle: 'italic',
  },
  placeholder: { fontSize: 12, color: '#78909c', padding: '8px 4px', fontStyle: 'italic' },
}
