/**
 * src/components/EstrategiaPanel.jsx
 *
 * Panel de configuración del cálculo NPK:
 *   1. Estrategia de fertilización (4 opciones)
 *   2. Laboreo (checkbox)
 *   3. Rendimiento esperado (kg/ha) — default yieldMedium del cultivo
 *   4. Residuos / paja — solo visible si CEREALS + fres===10 (regla B7)
 *   5. Accordion: parámetros N avanzados (overrides de N_EQUATION_DEFAULTS)
 *
 * Props:
 *   cultivo    — objeto cultivo Sativum | null
 *   params     — { strategy, tillage, cropYield, recogeResiduos, quemaResiduos, nEcuacion }
 *   onChange   — (params) => void
 */
import { useState } from 'react'
import { N_EQUATION_DEFAULTS } from '../data/sativum/algoParams'

// ── Catálogo de estrategias ───────────────────────────────────────────────────

const ESTRATEGIAS = [
  {
    id: 'SUFFICIENCY',
    label: 'Suficiencia',
    desc: 'Cubre necesidades mínimas del cultivo',
    color: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32',
  },
  {
    id: 'REDUCED',
    label: 'Reducida',
    desc: 'Aporte conservador, menor coste',
    color: '#fff8e1', border: '#ffe082', text: '#f57f17',
  },
  {
    id: 'MAINTENANCE',
    label: 'Mantenimiento',
    desc: 'Equilibrio entre producción y suelo',
    color: '#e3f2fd', border: '#90caf9', text: '#1565c0',
  },
  {
    id: 'MAXIMUM',
    label: 'Máxima',
    desc: 'Optimiza producción potencial máxima',
    color: '#fce4ec', border: '#f48fb1', text: '#880e4f',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function esCereal(cultivo) {
  return cultivo?.plantSpeciesGroup?.toUpperCase() === 'CEREALS'
}

function tieneResidueRule(cultivo) {
  return esCereal(cultivo) && cultivo?.fres === 10
}

// ── Componentes internos ──────────────────────────────────────────────────────

function ParamInput({ label, value, step = 0.1, min = 0, max, unit, onChange }) {
  return (
    <div style={SA.paramRow}>
      <span style={SA.paramLbl}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value))}
          style={SA.numInput}
        />
        {unit && <span style={SA.unit}>{unit}</span>}
      </span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EstrategiaPanel({ cultivo, params, onChange }) {
  const [openAvanzado, setOpenAvanzado] = useState(false)

  const set = (patch) => onChange({ ...params, ...patch })
  const setN = (patch) => onChange({ ...params, nEcuacion: { ...params.nEcuacion, ...patch } })

  // Valor efectivo de los overrides N (combina defaults con overrides)
  const nVal = (key) => params.nEcuacion[key] ?? N_EQUATION_DEFAULTS[key]

  // ── Placeholder sin cultivo ───────────────────────────────────────────────
  if (!cultivo) {
    return (
      <div style={SA.card}>
        <div style={SA.title}>⚙️ Estrategia de cálculo</div>
        <div style={SA.hint}>Selecciona un cultivo para configurar el cálculo.</div>
      </div>
    )
  }

  const mostrarResiduos = tieneResidueRule(cultivo)
  const yieldPlaceholder = cultivo.yieldMedium != null ? String(cultivo.yieldMedium) : '0'

  return (
    <div style={SA.card}>

      {/* ── Estrategia ────────────────────────────────────────────────────── */}
      <div style={SA.title}>⚙️ Estrategia de cálculo</div>

      <div style={SA.estrategiaGrid}>
        {ESTRATEGIAS.map(e => {
          const activa = params.strategy === e.id
          return (
            <button
              key={e.id}
              onClick={() => set({ strategy: e.id })}
              style={{
                ...SA.estrategiaBtn,
                background:   activa ? e.color    : '#f9fafb',
                borderColor:  activa ? e.border   : '#e0e6ed',
                color:        activa ? e.text      : '#546e7a',
                fontWeight:   activa ? 700         : 400,
                boxShadow:    activa ? `0 0 0 2px ${e.border}` : 'none',
              }}
            >
              <span style={{ fontSize: 12 }}>{e.label}</span>
              <span style={{ fontSize: 10, opacity: 0.8, marginTop: 2, lineHeight: 1.3 }}>{e.desc}</span>
            </button>
          )
        })}
      </div>

      {/* ── Laboreo ───────────────────────────────────────────────────────── */}
      <label style={SA.checkRow}>
        <input
          type="checkbox"
          checked={params.tillage}
          onChange={e => set({ tillage: e.target.checked })}
          style={{ marginRight: 6 }}
        />
        <span style={SA.checkLabel}>Laboreo previo al abonado</span>
      </label>

      {/* ── Rendimiento esperado ──────────────────────────────────────────── */}
      <div style={SA.sectionTitle}>Rendimiento esperado</div>

      <div style={SA.yieldRow}>
        <span style={SA.lbl}>Producción objetivo</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            value={params.cropYield ?? ''}
            placeholder={yieldPlaceholder}
            min={0}
            step={0.1}
            onChange={e => set({ cropYield: e.target.value === '' ? null : Number(e.target.value) })}
            style={SA.numInput}
          />
          <span style={SA.unit}>kg/ha</span>
        </span>
      </div>

      {/* Rango de referencia del catálogo */}
      <div style={SA.yieldHint}>
        Catálogo Sativum — mín: <strong>{cultivo.yieldLow ?? '—'}</strong> · med:{' '}
        <strong>{cultivo.yieldMedium ?? '—'}</strong> · máx:{' '}
        <strong>{cultivo.yieldHigh ?? '—'}</strong> kg/ha
      </div>

      {/* ── Residuos (regla B7, solo cereales fres=10) ────────────────────── */}
      {mostrarResiduos && (
        <>
          <div style={SA.sectionTitle}>Gestión de residuos (paja)</div>
          <label style={SA.checkRow}>
            <input
              type="checkbox"
              checked={params.recogeResiduos}
              onChange={e => set({ recogeResiduos: e.target.checked, quemaResiduos: false })}
              style={{ marginRight: 6 }}
            />
            <span style={SA.checkLabel}>Recoge la paja del campo</span>
          </label>
          {params.recogeResiduos && (
            <label style={{ ...SA.checkRow, marginLeft: 20 }}>
              <input
                type="checkbox"
                checked={params.quemaResiduos}
                onChange={e => set({ quemaResiduos: e.target.checked })}
                style={{ marginRight: 6 }}
              />
              <span style={SA.checkLabel}>Quema los residuos</span>
            </label>
          )}
          {!params.recogeResiduos && (
            <div style={SA.ruleBox}>
              Paja incorporada → <code>f_res = 100</code> (regla Sativum)
            </div>
          )}
        </>
      )}

      {/* ── Accordion: parámetros N avanzados ────────────────────────────── */}
      <button
        onClick={() => setOpenAvanzado(v => !v)}
        style={SA.accordionBtn}
      >
        <span>🔬 Parámetros N avanzados</span>
        <span style={{ fontSize: 10 }}>{openAvanzado ? '▲' : '▼'}</span>
      </button>

      {openAvanzado && (
        <div style={SA.accordionBody}>
          <div style={SA.accordionNote}>
            Overrides de <code>n_equation_parameter</code>. Vaciar = usar default.
          </div>
          <ParamInput
            label="N final suelo (n_end)"
            value={nVal('n_end')}
            unit="kg/ha"
            onChange={v => setN({ n_end: v })}
          />
          <ParamInput
            label="N perdido (n_lost)"
            value={nVal('n_lost')}
            unit="kg/ha"
            onChange={v => setN({ n_lost: v })}
          />
          <ParamInput
            label="Factor Nmin (f_nr)"
            value={nVal('f_nr')}
            step={0.01} min={0} max={1}
            onChange={v => setN({ f_nr: v })}
          />
          <ParamInput
            label="Eficiencia planta (beta_pl)"
            value={nVal('beta_pl')}
            step={0.01} min={0} max={1}
            onChange={v => setN({ beta_pl: v })}
          />
          <ParamInput
            label="Eficiencia fertilizante (efic)"
            value={nVal('efic')}
            step={0.01} min={0} max={1}
            onChange={v => setN({ efic: v })}
          />
          <button
            onClick={() => onChange({ ...params, nEcuacion: {} })}
            style={SA.resetBtn}
          >
            Restaurar defaults
          </button>
        </div>
      )}

    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const SA = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  title: { fontSize: 12, fontWeight: 700, color: '#1a237e', marginBottom: 8 },
  hint:  { fontSize: 12, color: '#90a4ae', fontStyle: 'italic', padding: '4px 0' },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', margin: '10px 0 5px',
  },

  // Estrategia
  estrategiaGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8,
  },
  estrategiaBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '6px 8px', borderRadius: 5,
    border: '1px solid', cursor: 'pointer',
    transition: 'all 0.12s',
    background: '#f9fafb', textAlign: 'left',
  },

  // Laboreo / checkboxes
  checkRow: {
    display: 'flex', alignItems: 'center',
    fontSize: 12, cursor: 'pointer',
    padding: '3px 0',
  },
  checkLabel: { color: '#263238' },

  // Rendimiento
  yieldRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0',
    borderBottom: '1px solid #f0f4f7',
  },
  yieldHint: {
    fontSize: 10, color: '#78909c',
    background: '#f5f7fa', borderRadius: 4,
    padding: '3px 8px', marginTop: 3, marginBottom: 2,
  },
  lbl:  { color: '#78909c' },
  unit: { color: '#90a4ae', fontSize: 10 },
  numInput: {
    width: 72, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 12, fontFamily: 'monospace',
    textAlign: 'right', outline: 'none',
    color: '#263238',
  },

  // Residuos
  ruleBox: {
    fontSize: 10, color: '#e65100',
    background: '#fff3e0', border: '1px solid #ffe0b2',
    borderRadius: 4, padding: '3px 8px', marginTop: 2,
  },

  // Accordion
  accordionBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginTop: 10, padding: '6px 8px',
    background: '#f5f7fa', border: '1px solid #e0e6ed', borderRadius: 4,
    fontSize: 11, color: '#546e7a', cursor: 'pointer',
    fontFamily: 'inherit',
  },
  accordionBody: {
    padding: '6px 0 2px',
    borderLeft: '2px solid #e0e6ed',
    marginLeft: 4, paddingLeft: 8,
  },
  accordionNote: {
    fontSize: 10, color: '#90a4ae', marginBottom: 5, fontStyle: 'italic',
  },
  paramRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0',
    borderBottom: '1px solid #f0f4f7',
  },
  paramLbl: { color: '#78909c' },
  resetBtn: {
    marginTop: 6, fontSize: 11, padding: '3px 10px',
    background: '#fff', border: '1px solid #cfd8dc', borderRadius: 3,
    cursor: 'pointer', color: '#546e7a', fontFamily: 'inherit',
  },
}
