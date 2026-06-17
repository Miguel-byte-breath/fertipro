/**
 * src/components/SueloCard.jsx
 *
 * Tarjeta de análisis de suelo + agua de riego.
 *
 * Sección 1 — Análisis de suelo (datos ArcGIS Sativum):
 *   MO (%), Textura (clase USDA simplificada), pH, P Olsen (ppm),
 *   K suelo (ppm), K riego (mg/L, informativo).
 *   CEC (meq/kg) — editable: el ArcGIS no lo publica directamente.
 *
 * Sección 2 — Agua de riego:
 *   Selector de fuente SIEX.
 *   Si fuente = 2 (subterránea) → NO₃ precargado desde ArcGIS (solo lectura),
 *     dotación m³/ha manual.
 *   Si otra fuente con riego → NO₃ (mg/L) y dotación (m³/ha) manuales.
 *
 * Props:
 *   suelo         — resultado de normalizarSuelo() | null
 *   loading       — bool (mientras se consulta el centroide)
 *   cec           — number (meq/kg, estado en App)
 *   onCecChange   — (value: number) => void
 *   riego         — { fuenteId, no3MgL, dotacionM3 }
 *   onRiegoChange — (riego) => void
 */
import { useEffect } from 'react'
import { FUENTES_AGUA, FUENTE_SUBTERRANEA, FUENTE_SIN_RIEGO } from '../data/sativum/fuentesAgua'
import soilTypesSimpl from '../data/sativum/soilTypesSimpl.json'

const SOIL_LABEL = Object.fromEntries(
  soilTypesSimpl.map(s => [s.descNutrients, s.description])
)

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v, dec = 2, unit = '') {
  if (v == null || isNaN(v)) return null
  return `${Number(v).toFixed(dec)}${unit ? ' ' + unit : ''}`
}

// ── componentes internos ──────────────────────────────────────────────────────

function Row({ label, value, unit }) {
  const display = value != null
    ? <span style={S.val}>{value}{unit ? <span style={S.unit}> {unit}</span> : null}</span>
    : <span style={S.nd}>nd</span>
  return (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      {display}
    </div>
  )
}

function EditRow({ label, value, unit, onChange, min, max, step = 1 }) {
  return (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(Number(e.target.value))}
          style={S.numInput}
        />
        {unit && <span style={S.unit}>{unit}</span>}
      </span>
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export default function SueloCard({ suelo, loading, cec, onCecChange, riego, onRiegoChange }) {

  const fuenteId  = riego?.fuenteId ?? 0
  const esSubterr = fuenteId === FUENTE_SUBTERRANEA
  const tieneRiego = fuenteId !== FUENTE_SIN_RIEGO

  // Auto-rellenar NO₃ desde ArcGIS cuando fuente = subterránea y hay dato
  useEffect(() => {
    if (esSubterr && suelo?.no3Irrigation != null) {
      onRiegoChange({ ...riego, no3MgL: suelo.no3Irrigation })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esSubterr, suelo?.no3Irrigation])

  // ── loading / sin datos ───────────────────────────────────────────────────
  if (loading) {
    return <div style={S.note}>⏳ Consultando datos de suelo…</div>
  }

  // ── render ────────────────────────────────────────────────────────────────
  const texLabel = suelo?.soilType ? SOIL_LABEL[suelo.soilType] ?? suelo.soilType : null

  return (
    <div style={S.card}>

      {/* ── Análisis de suelo ──────────────────────────────────────────── */}
      <div style={S.titleRow}>
        <span style={S.title}>🌱 Análisis de suelo</span>
        {!suelo && <span style={S.badge}>sin datos ArcGIS</span>}
      </div>

      <Row label="Textura (USDA oficial)" value={suelo?.soilTypeUsdaLabel ?? null} />
      <Row label="Textura simplificada"   value={texLabel} />
      <Row label="Materia orgánica" value={fmtNum(suelo?.organicMatter, 2)} unit="%" />
      <Row label="pH"               value={fmtNum(suelo?.ph, 1)} />
      <Row label="P Olsen"          value={fmtNum(suelo?.pOlsen, 1)} unit="ppm" />
      <Row label="K suelo"          value={fmtNum(suelo?.kSoil, 0)} unit="ppm" />
      <Row label="K riego (ArcGIS)" value={fmtNum(suelo?.kIrrigation, 1)} unit="mg/L" />

      <EditRow
        label="CEC"
        value={cec}
        unit="meq/kg"
        min={50} max={600} step={5}
        onChange={onCecChange}
      />

      {/* ── Agua de riego ──────────────────────────────────────────────── */}
      <div style={{ ...S.titleRow, marginTop: 10 }}>
        <span style={S.title}>💧 Agua de riego</span>
      </div>

      {/* Fuente SIEX */}
      <div style={S.row}>
        <span style={S.lbl}>Fuente SIEX</span>
        <select
          value={fuenteId}
          onChange={e => onRiegoChange({ ...riego, fuenteId: Number(e.target.value), no3MgL: '', dotacionM3: '', pMgL: '', kMgL: '' })}
          style={S.select}
        >
          {FUENTES_AGUA.map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Campos condicionales */}
      {tieneRiego && (
        <>
          {/* NO₃ */}
          <div style={S.row}>
            <span style={S.lbl}>NO₃ agua riego</span>
            {esSubterr ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={suelo?.no3Irrigation ?? ''}
                  readOnly
                  style={{ ...S.numInput, background: '#f5f7fa', color: '#546e7a', cursor: 'default' }}
                />
                <span style={S.unit}>mg/L</span>
                <span style={S.arcgisBadge}>ArcGIS</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={riego?.no3MgL ?? ''}
                  min={0} step={0.1}
                  placeholder="0.0"
                  onChange={e => onRiegoChange({ ...riego, no3MgL: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={S.numInput}
                />
                <span style={S.unit}>mg/L</span>
              </span>
            )}
          </div>

          {/* Dotación */}
          <div style={S.row}>
            <span style={S.lbl}>Dotación riego</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={riego?.dotacionM3 ?? ''}
                min={0} step={10}
                placeholder="0"
                onChange={e => onRiegoChange({ ...riego, dotacionM3: e.target.value === '' ? '' : Number(e.target.value) })}
                style={S.numInput}
              />
              <span style={S.unit}>m³/ha</span>
            </span>
          </div>

          {/* P agua riego */}
          <div style={S.row}>
            <span style={S.lbl}>P agua riego</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={riego?.pMgL ?? ''}
                min={0} step={0.1}
                placeholder="0.0"
                onChange={e => onRiegoChange({ ...riego, pMgL: e.target.value === '' ? '' : Number(e.target.value) })}
                style={S.numInput}
              />
              <span style={S.unit}>mg/L</span>
            </span>
          </div>

          {/* K agua riego */}
          <div style={S.row}>
            <span style={S.lbl}>K agua riego</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={riego?.kMgL ?? ''}
                min={0} step={0.1}
                placeholder="0.0"
                onChange={e => onRiegoChange({ ...riego, kMgL: e.target.value === '' ? '' : Number(e.target.value) })}
                style={S.numInput}
              />
              <span style={S.unit}>mg/L</span>
            </span>
          </div>

          {/* N/P₂O₅/K₂O aportados por riego (informativo) */}
          {(() => {
            const no3 = esSubterr ? suelo?.no3Irrigation : riego?.no3MgL
            const dot = Number(riego?.dotacionM3) || 0
            const p   = Number(riego?.pMgL)       || 0
            const k   = Number(riego?.kMgL)       || 0
            if (!dot) return null
            const nAgua = no3 && dot ? (Number(no3) * dot * 0.001 * (14 / 62)).toFixed(1) : null
            const p2o5  = p   && dot ? (p   * dot * 0.001 * 2.2914).toFixed(1)            : null
            const k2o   = k   && dot ? (k   * dot * 0.001 * 1.2046).toFixed(1)            : null
            if (!nAgua && !p2o5 && !k2o) return null
            return (
              <div style={S.infoBox}>
                <span style={{ fontWeight: 600 }}>Aportado por riego:</span>
                {nAgua && <span> N <strong>{nAgua} kg/ha</strong></span>}
                {p2o5  && <span>{nAgua ? ' ·' : ''} P₂O₅ <strong>{p2o5} kg/ha</strong></span>}
                {k2o   && <span>{(nAgua || p2o5) ? ' ·' : ''} K₂O <strong>{k2o} kg/ha</strong></span>}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ── estilos ───────────────────────────────────────────────────────────────────

const S = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  titleRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 6,
  },
  title: { fontSize: 12, fontWeight: 700, color: '#1a237e' },
  badge: {
    fontSize: 10, color: '#78909c', background: '#eceff1',
    border: '1px solid #cfd8dc', borderRadius: 8,
    padding: '1px 6px',
  },
  arcgisBadge: {
    fontSize: 9, color: '#1565c0', background: '#e3f2fd',
    border: '1px solid #bbdefb', borderRadius: 8,
    padding: '1px 5px', fontWeight: 600,
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0',
    borderBottom: '1px solid #f0f4f7',
  },
  lbl:  { color: '#78909c', flexShrink: 0, marginRight: 8 },
  val:  { color: '#263238', fontFamily: 'monospace' },
  nd:   { color: '#bdbdbd', fontStyle: 'italic' },
  unit: { color: '#90a4ae', fontSize: 10 },
  numInput: {
    width: 72, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 12, fontFamily: 'monospace',
    textAlign: 'right', outline: 'none',
    color: '#263238',
  },
  select: {
    fontSize: 11, padding: '2px 4px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    color: '#263238', background: '#fff',
    maxWidth: 200,
  },
  note: {
    margin: 12, padding: '8px 12px',
    background: '#fffde7', border: '1px solid #fff59d', borderRadius: 6,
    fontSize: 12, color: '#827717',
  },
  infoBox: {
    marginTop: 4, fontSize: 11, color: '#1565c0',
    background: '#e3f2fd', border: '1px solid #bbdefb',
    borderRadius: 4, padding: '4px 8px',
  },
}
