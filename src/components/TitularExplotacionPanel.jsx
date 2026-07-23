/**
 * src/components/TitularExplotacionPanel.jsx
 *
 * Datos del titular de la explotación agraria (persona física o jurídica) a
 * la que pertenece la unidad de producción de este plan de abonado (RD
 * 1051/2022, art. 3.i/6 — "La persona titular de la explotación elaborará y
 * aplicará un plan de abonado para cada unidad de producción..."). El NIF/CIF
 * permite vincular el plan al titular ante cualquier requerimiento oficial.
 *
 * Mismo patrón que AsesoramientoPanel.jsx: colapsable, se auto-expande si ya
 * hay datos guardados, badge con el nombre/razón social si está colapsado.
 *
 * Props:
 *   titular       — { tipo: 'fisica'|'juridica', nombreRazonSocial, nifCif }
 *   onChange(obj) — callback cuando cambia cualquier campo
 */
import { useState } from 'react'

export const TITULAR_INICIAL = { tipo: 'fisica', nombreRazonSocial: '', nifCif: '' }

function tieneDatos(titular) {
  return !!(titular?.nombreRazonSocial || titular?.nifCif)
}

export default function TitularExplotacionPanel({ titular, onChange }) {
  const [open, setOpen] = useState(() => tieneDatos(titular))

  function handleField(key, value) {
    onChange({ ...titular, [key]: value })
  }

  const hasDatos = tieneDatos(titular)
  const esJuridica = titular?.tipo === 'juridica'

  return (
    <div style={S.wrap}>
      {/* ── Cabecera colapsable ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={S.header}
      >
        <span style={S.headerLabel}>
          <span style={S.icon}>🧑‍🌾</span>
          Titular de la explotación
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasDatos && !open && (
            <span style={S.badge}>
              {titular.nombreRazonSocial || titular.nifCif}
            </span>
          )}
          <span style={{ color: '#90a4ae', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {/* ── Formulario ── */}
      {open && (
        <div style={S.body}>
          <div style={S.field}>
            <label style={S.label}>Tipo</label>
            <div style={S.toggleRow}>
              <button
                type="button"
                onClick={() => handleField('tipo', 'fisica')}
                style={{ ...S.toggleBtn, ...(!esJuridica ? S.toggleBtnActive : {}) }}
              >
                Persona física
              </button>
              <button
                type="button"
                onClick={() => handleField('tipo', 'juridica')}
                style={{ ...S.toggleBtn, ...(esJuridica ? S.toggleBtnActive : {}) }}
              >
                Persona jurídica
              </button>
            </div>
          </div>

          <div style={S.grid}>
            <div style={S.field}>
              <label style={S.label}>{esJuridica ? 'Razón social' : 'Nombre y apellidos'}</label>
              <input
                type="text"
                value={titular?.nombreRazonSocial ?? ''}
                placeholder={esJuridica ? 'Razón social' : 'Nombre y apellidos'}
                onChange={e => handleField('nombreRazonSocial', e.target.value)}
                style={S.input}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>{esJuridica ? 'CIF' : 'NIF'}</label>
              <input
                type="text"
                value={titular?.nifCif ?? ''}
                placeholder="00000000X"
                onChange={e => handleField('nifCif', e.target.value)}
                style={S.input}
              />
            </div>
          </div>

          {hasDatos && (
            <button
              type="button"
              style={S.clearBtn}
              onClick={() => onChange({ ...TITULAR_INICIAL })}
            >
              Borrar datos
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Estilos (mismo lenguaje visual que AsesoramientoPanel.jsx) ─────────────────
const S = {
  wrap: {
    borderTop: '1px solid #eceff1',
    background: '#fff',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#546e7a',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  icon: {
    fontSize: 13,
  },
  badge: {
    fontSize: 10,
    color: '#1a237e',
    background: '#e8eaf6',
    borderRadius: 3,
    padding: '1px 5px',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
  body: {
    padding: '4px 12px 12px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginBottom: 8,
  },
  toggleRow: {
    display: 'flex',
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    padding: '5px 6px',
    fontSize: 11,
    fontWeight: 600,
    color: '#546e7a',
    background: '#eceff1',
    border: '1px solid #cfd8dc',
    borderRadius: 4,
    cursor: 'pointer',
  },
  toggleBtnActive: {
    color: '#fff',
    background: '#1a237e',
    border: '1px solid #1a237e',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px 10px',
  },
  label: {
    fontSize: 10,
    color: '#78909c',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    padding: '4px 6px',
    fontSize: 12,
    border: '1px solid #cfd8dc',
    borderRadius: 4,
    fontFamily: 'inherit',
    color: '#263238',
    width: '100%',
    boxSizing: 'border-box',
  },
  clearBtn: {
    marginTop: 4,
    fontSize: 10,
    color: '#90a4ae',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
}
