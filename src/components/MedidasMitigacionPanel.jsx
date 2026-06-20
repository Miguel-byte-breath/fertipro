/**
 * MedidasMitigacionPanel.jsx
 *
 * Panel colapsable con selección múltiple de medidas de mitigación de GEI
 * (Anexo V del RD 1051/2022). Las medidas se muestran agrupadas por categoría.
 *
 * Props:
 *   seleccionadas  {number[]}   — array de codigoSiex seleccionados
 *   onChange       {Function}   — (codigoSiex[]) => void
 */
import { useState } from 'react'
import { MEDIDAS_MITIGACION_GEI, GRUPOS_GEI } from '../data/sativum/medidasMitigacionGEI'

export default function MedidasMitigacionPanel({ seleccionadas = [], onChange }) {
  const [abierto, setAbierto] = useState(false)

  const toggle = (codigo) => {
    if (seleccionadas.includes(codigo)) {
      onChange(seleccionadas.filter(c => c !== codigo))
    } else {
      onChange([...seleccionadas, codigo])
    }
  }

  const nSeleccionadas = seleccionadas.length

  return (
    <div style={S.card}>
      {/* Cabecera colapsable */}
      <button style={S.header} onClick={() => setAbierto(v => !v)}>
        <span style={S.title}>
          Medidas de mitigación GEI
          <span style={S.normRef}>Anexo V · RD 1051/2022</span>
        </span>
        <span style={S.right}>
          {nSeleccionadas > 0 && (
            <span style={S.badge}>{nSeleccionadas}</span>
          )}
          <span style={{ fontSize: 11, color: '#78909c', marginLeft: 4 }}>
            {abierto ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {/* Contenido desplegable */}
      {abierto && (
        <div style={S.body}>
          {GRUPOS_GEI.map(grupo => {
            const medidas = MEDIDAS_MITIGACION_GEI.filter(m => m.grupo === grupo)
            return (
              <div key={grupo} style={S.grupo}>
                <div style={S.grupoLabel}>{grupo}</div>
                {medidas.map(m => {
                  const checked = seleccionadas.includes(m.codigoSiex)
                  return (
                    <label key={m.codigoSiex} style={S.item}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.codigoSiex)}
                        style={S.checkbox}
                      />
                      <span style={{ ...S.itemText, color: checked ? '#1b5e20' : '#37474f' }}>
                        {m.texto}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          })}

          {nSeleccionadas > 0 && (
            <button
              style={S.clearBtn}
              onClick={() => onChange([])}
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const S = {
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    marginBottom: 8,
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: '#263238',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  normRef: {
    fontSize: 10,
    fontWeight: 400,
    color: '#78909c',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  badge: {
    background: '#2e7d32',
    color: '#fff',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    minWidth: 18,
    textAlign: 'center',
  },
  body: {
    padding: '4px 12px 12px',
    borderTop: '1px solid #f0f0f0',
  },
  grupo: {
    marginTop: 10,
  },
  grupoLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#546e7a',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottom: '1px solid #f0f0f0',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
    padding: '4px 0',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: 2,
    flexShrink: 0,
    accentColor: '#2e7d32',
    cursor: 'pointer',
  },
  itemText: {
    fontSize: 11,
    lineHeight: 1.4,
  },
  clearBtn: {
    marginTop: 10,
    fontSize: 10,
    color: '#78909c',
    background: 'none',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
    padding: '3px 8px',
    cursor: 'pointer',
  },
}
