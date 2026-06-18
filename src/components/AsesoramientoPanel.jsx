/**
 * src/components/AsesoramientoPanel.jsx
 *
 * Datos del asesor responsable del plan de abonado (REGFER).
 * El componente es colapsable; se auto-expande si ya hay datos guardados.
 *
 * Props:
 *   asesor        — { regfer, nombre, apellidos, nif, telefono, email }
 *   onChange(obj) — callback cuando cambia cualquier campo
 */
import { useState } from 'react'

const CAMPOS = [
  { key: 'regfer',    label: 'Nº REGFER',  required: true,  type: 'text',  placeholder: 'Nº de registro' },
  { key: 'nombre',    label: 'Nombre',     required: true,  type: 'text',  placeholder: 'Nombre del asesor' },
  { key: 'apellidos', label: 'Apellidos',  required: true,  type: 'text',  placeholder: 'Apellidos' },
  { key: 'nif',       label: 'NIF',        required: true,  type: 'text',  placeholder: '00000000X' },
  { key: 'telefono',  label: 'Teléfono',   required: false, type: 'tel',   placeholder: 'Opcional' },
  { key: 'email',     label: 'Email',      required: false, type: 'email', placeholder: 'Opcional' },
]

function tienesDatos(asesor) {
  return !!(asesor?.regfer || asesor?.nombre || asesor?.apellidos || asesor?.nif)
}

export default function AsesoramientoPanel({ asesor, onChange }) {
  const [open, setOpen] = useState(() => tienesDatos(asesor))

  function handleField(key, value) {
    onChange({ ...asesor, [key]: value })
  }

  const hasDatos = tienesDatos(asesor)

  return (
    <div style={S.wrap}>
      {/* ── Cabecera colapsable ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={S.header}
      >
        <span style={S.headerLabel}>
          <span style={S.icon}>📋</span>
          Asesor responsable del plan
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasDatos && !open && (
            <span style={S.badge}>
              {[asesor.nombre, asesor.apellidos].filter(Boolean).join(' ') || asesor.regfer}
            </span>
          )}
          <span style={{ color: '#90a4ae', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {/* ── Formulario ── */}
      {open && (
        <div style={S.body}>
          <div style={S.grid}>
            {CAMPOS.map(({ key, label, required, type, placeholder }) => (
              <div key={key} style={S.field}>
                <label style={S.label}>
                  {label}
                  {required && <span style={S.req}> *</span>}
                </label>
                <input
                  type={type}
                  value={asesor?.[key] ?? ''}
                  placeholder={placeholder}
                  onChange={e => handleField(key, e.target.value)}
                  style={S.input}
                />
              </div>
            ))}
          </div>
          {hasDatos && (
            <button
              type="button"
              style={S.clearBtn}
              onClick={() => onChange({ regfer: '', nombre: '', apellidos: '', nif: '', telefono: '', email: '' })}
            >
              Borrar datos
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
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
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px 10px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: 10,
    color: '#78909c',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  req: {
    color: '#e53935',
    fontWeight: 700,
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
    marginTop: 8,
    fontSize: 10,
    color: '#90a4ae',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
}
