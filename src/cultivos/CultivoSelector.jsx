/**
 * src/cultivos/CultivoSelector.jsx
 *
 * Selector de cultivo cargado desde el catálogo Sativum (/nutrients/crops).
 *
 * Props:
 *   value    — name del cultivo seleccionado (string) o null
 *   onChange — callback(cultivo) → recibe el objeto completo de Sativum o null
 */
import { useEffect, useState } from 'react'
import { getCultivos, agruparPorGrupo, tieneRendimientoAnomalo } from '../api/sativum-crops'

/** Etiquetas legibles para plantSpeciesGroup */
const GRUPO_LABEL = {
  CEREALS:               'Cereales',
  FORAGE_NON_LEGUME:     'Forrajes no leguminosos',
  FORAGE_LEGUME:         'Forrajes leguminosos',
  FORAGE_MIX_LEGUME_GRASS: 'Mezclas forrajeras',
  INDUSTRIAL:            'Cultivos industriales',
  PULSES:                'Leguminosas grano',
  HORTICULTURAL:         'Hortícolas',
  TUBERS_ROOT:           'Tubérculos y raíces',
  TREES:                 'Leñosos',
  OTHER:                 'Otros',
}

function grupoLabel(grupo) {
  return GRUPO_LABEL[grupo?.toUpperCase()] ?? grupo
}

export default function CultivoSelector({ value, onChange }) {
  const [grupos,  setGrupos]  = useState([])   // Map<string, object[]>
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [allCultivos, setAllCultivos] = useState([])

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

  const handleChange = (e) => {
    const name = e.target.value
    if (!name) return onChange?.(null)
    const cultivo = allCultivos.find(c => c.name === name) ?? null
    onChange?.(cultivo)
  }

  if (loading) return <div style={S.placeholder}>Cargando catálogo Sativum…</div>
  if (error)   return <div style={{ ...S.placeholder, color: '#c62828' }}>⚠️ {error}</div>

  const total = allCultivos.length

  return (
    <div>
      <label style={S.label}>
        Cultivo
        <span style={S.count}>{total} disponibles</span>
      </label>
      <select value={value ?? ''} onChange={handleChange} style={S.select}>
        <option value="">— Selecciona un cultivo —</option>
        {[...grupos.entries()].map(([grupo, cultivos]) => (
          <optgroup key={grupo} label={grupoLabel(grupo)}>
            {cultivos.map(c => (
              <option key={c.id} value={c.name}>
                {c.name}
                {c.nfixCode ? ' · fijador N' : ''}
                {tieneRendimientoAnomalo(c) ? ' ⚠️' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

const S = {
  label: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    fontSize: 12, fontWeight: 600, color: '#37474f', marginBottom: 4,
  },
  count:  { fontWeight: 400, fontSize: 11, color: '#90a4ae' },
  select: {
    width: '100%', padding: '7px 9px', fontSize: 13,
    border: '1px solid #cfd8dc', borderRadius: 4, background: '#fff',
    fontFamily: 'inherit', color: '#263238',
  },
  placeholder: { fontSize: 12, color: '#78909c', padding: '8px 4px', fontStyle: 'italic' },
}
