/**
 * src/cultivos/CultivoCard.jsx
 *
 * Tarjeta de detalle del cultivo seleccionado, con datos del catálogo Sativum.
 *
 * Campos mostrados:
 *   name, plantSpeciesGroup, dryMatter, n/p/k (%), hi, nfixCode,
 *   yieldLow / yieldMedium / yieldHigh, advertencia de rendimiento anómalo.
 *
 * El coeficiente de residuos (fres) del catálogo YA NO se muestra como dato
 * fijo aquí (generaba confusión: se veía un valor de catálogo que en realidad
 * nunca llegaba al payload de /fertilicalc/algo/ para el cultivo actual, solo
 * para el anterior). En su lugar, sección "Gestión de residuos" — editable,
 * mismo patrón y misma regla (fresRule.js) que CultivoAnteriorPanel.jsx.
 *
 * Props añadidas (2026-07-17):
 *   params          — { recogeResiduos, quemaResiduos, fRes }, subconjunto del
 *                      estado `calculo` de App.jsx
 *   onParamsChange  — (params) => void, normalmente setCalculo
 */
import { tieneRendimientoAnomalo } from '../api/sativum-crops'
import { computeAutoFRes, fResEditable } from '../utils/fresRule'

function esCereal(cultivo) {
  return cultivo?.plantSpeciesGroup?.toUpperCase() === 'CEREALS'
}

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

function pct(v) {
  if (v == null) return <span style={S.nd}>nd</span>
  return `${Number(v).toFixed(3)} %`
}
function num(v, dec = 2) {
  if (v == null) return <span style={S.nd}>nd</span>
  return Number(v).toFixed(dec)
}

export default function CultivoCard({ cultivo, params, onParamsChange }) {
  if (!cultivo) {
    return (
      <div style={{ padding: '14px 12px', fontSize: 12, color: '#90a4ae', fontStyle: 'italic' }}>
        Selecciona un cultivo para ver sus parámetros.
      </div>
    )
  }

  const anomalo  = tieneRendimientoAnomalo(cultivo)
  const grupo    = GRUPO_LABEL[cultivo.plantSpeciesGroup?.toUpperCase()] ?? cultivo.plantSpeciesGroup

  // ── Gestión de residuos (cultivo actual) ─────────────────────────────────
  const set             = patch => onParamsChange?.({ ...params, ...patch })
  const esCerealCultivo = esCereal(cultivo)
  const labelResiduos    = esCerealCultivo ? '¿Se recoge la paja?' : 'Recoge residuos del campo'
  const autoFRes         = computeAutoFRes(cultivo, params?.recogeResiduos)
  const editableFRes     = fResEditable(params?.recogeResiduos)

  return (
    <div style={S.card}>

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div>
          <div style={S.title}>{cultivo.name}</div>
          <div style={S.subtitle}>{grupo}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cultivo.nfixCode && <span style={{ ...S.badge, background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9' }}>🌱 Fijador N</span>}
          {anomalo          && <span style={{ ...S.badge, background: '#fff3e0', color: '#e65100', border: '1px solid #ffe0b2' }}>⚠️ Rend. anómalo</span>}
        </div>
      </div>

      {/* ── Parámetros agronómicos ────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Parámetros agronómicos</div>
        <div style={{ ...S.grid, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <Param label="Materia seca"        value={cultivo.dryMatter != null ? `${cultivo.dryMatter} %` : null} />
          <Param label="Harvest Index (HI)"  value={cultivo.hi        != null ? num(cultivo.hi)            : null} />
        </div>
      </div>

      {/* ── Gestión de residuos (editable) ───────────────────────────────── */}
      {onParamsChange && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Gestión de residuos</div>

          <label style={S.checkRow}>
            <input
              type="checkbox"
              checked={!!params?.recogeResiduos}
              onChange={e => set({ recogeResiduos: e.target.checked, fRes: null })}
              style={{ marginRight: 6 }}
            />
            <span>{labelResiduos}</span>
          </label>

          {esCerealCultivo && (
            <label style={S.checkRow}>
              <input
                type="checkbox"
                checked={!!params?.quemaResiduos}
                onChange={e => set({ quemaResiduos: e.target.checked })}
                style={{ marginRight: 6 }}
              />
              <span>Quema los residuos</span>
            </label>
          )}

          <div style={S.residuosRow}>
            <span style={S.paramLabel}>Residuos en campo</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={editableFRes ? (params?.fRes ?? '') : (autoFRes ?? '')}
                placeholder={autoFRes !== null ? String(autoFRes) : ''}
                min={0}
                max={100}
                step={5}
                disabled={!editableFRes}
                onChange={e => set({ fRes: e.target.value === '' ? null : Number(e.target.value) })}
                style={editableFRes ? S.numInput : { ...S.numInput, ...S.numInputDisabled }}
              />
              <span style={S.unit}>%</span>
            </span>
          </div>
          {!editableFRes && (
            <div style={S.residuosHint}>
              Fijo en {autoFRes}% — marca "{labelResiduos}" para poder editarlo.
            </div>
          )}
        </div>
      )}

      {/* ── Nutrientes en cosecha ─────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Concentración en cosecha</div>
        <div style={S.grid}>
          <Param label="N (%)" value={cultivo.n != null ? pct(cultivo.n) : null} raw />
          <Param label="P (%)" value={cultivo.p != null ? pct(cultivo.p) : null} raw />
          <Param label="K (%)" value={cultivo.k != null ? pct(cultivo.k) : null} raw />
        </div>
      </div>

      {/* ── Rendimientos esperados ────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Rendimientos esperados (kg/ha)</div>
        <div style={S.grid}>
          <Param label="Mínimo"  value={cultivo.yieldLow    != null ? `${cultivo.yieldLow} kg/ha`    : null} warn={anomalo} />
          <Param label="Medio"   value={cultivo.yieldMedium != null ? `${cultivo.yieldMedium} kg/ha`  : null} warn={anomalo} />
          <Param label="Máximo"  value={cultivo.yieldHigh   != null ? `${cultivo.yieldHigh} kg/ha`    : null} />
        </div>
        {anomalo && (
          <div style={S.warningBox}>
            ⚠️ Rend. medio ({cultivo.yieldMedium} kg/ha) &lt; mínimo ({cultivo.yieldLow} kg/ha): dato anómalo en catálogo Sativum (id {cultivo.id}).
          </div>
        )}
      </div>

    </div>
  )
}

function Param({ label, value, raw = false, warn = false }) {
  const display = value == null
    ? <span style={S.nd}>nd</span>
    : raw ? value : <span style={warn ? { color: '#e65100' } : {}}>{value}</span>
  return (
    <div style={S.paramItem}>
      <div style={S.paramLabel}>{label}</div>
      <div style={S.paramValue}>{display}</div>
    </div>
  )
}

const S = {
  card: {
    margin: 12, padding: 12,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 8, paddingBottom: 8, borderBottom: '1px solid #eceff1', marginBottom: 10,
  },
  title:    { fontSize: 14, fontWeight: 700, color: '#1a237e' },
  subtitle: { fontSize: 11, color: '#78909c', marginTop: 2 },
  badge: {
    fontSize: 10, fontWeight: 600, padding: '2px 7px',
    borderRadius: 10, whiteSpace: 'nowrap',
  },
  section:      { marginBottom: 10 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', marginBottom: 6,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
  },
  paramItem: {
    background: '#f5f7fa', borderRadius: 4, padding: '5px 8px',
  },
  paramLabel: { fontSize: 10, color: '#78909c' },
  paramValue: { fontSize: 12, fontWeight: 600, color: '#263238' },
  nd:         { color: '#bdbdbd' },
  warningBox: {
    marginTop: 6, fontSize: 11, color: '#e65100',
    background: '#fff3e0', border: '1px solid #ffe0b2',
    borderRadius: 4, padding: '5px 8px',
  },

  // Gestión de residuos
  checkRow: {
    display: 'flex', alignItems: 'center',
    fontSize: 12, cursor: 'pointer', padding: '3px 0',
  },
  residuosRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0', borderTop: '1px solid #f0f4f7', marginTop: 2,
  },
  residuosHint: { fontSize: 11, color: '#90a4ae', fontStyle: 'italic', marginTop: 2 },
  unit:         { color: '#90a4ae', fontSize: 10 },
  numInput: {
    width: 80, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 12, fontFamily: 'monospace', textAlign: 'right',
    color: '#263238',
  },
  numInputDisabled: {
    background: '#f5f7fa', color: '#90a4ae', cursor: 'not-allowed',
  },
}
