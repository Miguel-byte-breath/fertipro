/**
 * src/cultivos/CultivoSelector.jsx
 *
 * Selector de cultivo agrupado por categoría.
 *
 * Props:
 *   value     — nombre del cultivo seleccionado (string) o null
 *   onChange  — callback(cultivo)  → recibe el objeto completo del cultivo o null
 *
 * El componente gestiona internamente la carga del JSON.
 */
import { useEffect, useState } from 'react'
import { listarCultivosPorCategoria, getCultivoPorNombre } from '../data/extracciones'

export default function CultivoSelector({ value, onChange }) {
  const [grupos,  setGrupos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    listarCultivosPorCategoria()
      .then(g => { if (!cancelled) { setGrupos(g); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const handleChange = async (e) => {
    const nombre = e.target.value
    if (!nombre) return onChange?.(null)
    const cultivo = await getCultivoPorNombre(nombre)
    onChange?.(cultivo)
  }

  if (loading) {
    return <div style={S.placeholder}>Cargando catálogo de cultivos…</div>
  }
  if (error) {
    return <div style={{ ...S.placeholder, color: '#c62828' }}>⚠️ {error}</div>
  }

  const total = grupos.reduce((s, g) => s + g.cultivos.length, 0)

  return (
    <div>
      <label style={S.label}>
        Cultivo
        <span style={S.count}>{total} disponibles</span>
      </label>
      <select value={value ?? ''} onChange={handleChange} style={S.select}>
        <option value="">— Selecciona un cultivo —</option>
        {grupos.map(g => (
          <optgroup key={g.categoria} label={g.categoria}>
            {g.cultivos.map(c => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}{c.n_fijado ? ' · fijador N' : ''}
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
  count: {
    fontWeight: 400, fontSize: 11, color: '#90a4ae',
  },
  select: {
    width: '100%', padding: '7px 9px', fontSize: 13,
    border: '1px solid #cfd8dc', borderRadius: 4, background: '#fff',
    fontFamily: 'inherit', color: '#263238',
  },
  placeholder: {
    fontSize: 12, color: '#78909c', padding: '8px 4px', fontStyle: 'italic',
  },
}
