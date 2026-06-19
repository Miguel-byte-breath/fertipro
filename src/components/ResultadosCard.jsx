/**
 * src/components/ResultadosCard.jsx
 *
 * Muestra el resultado del cálculo NPK (FertiliCalc) y el estado de cobertura
 * del plan de aplicaciones. Ofrece el botón para abrir el diálogo Sativum.
 *
 * Props:
 *   npk             — respuesta cruda /algo/
 *   npkParaRec      — { n, p, k } neto a cubrir por fertilizante (tras riego)
 *   planItems       — array de aplicaciones del plan (ambos orígenes)
 *   nRiego / pRiego / kRiego — kg/ha cubiertos por riego
 *   cultivo         — objeto cultivo
 *   loading / error
 *   onOpenSativumDialog — callback para abrir SativumApplicationDialog
 */
import { pToOxide, kToOxide } from '../api/sativum-fertilizers'

const P_TO_P2O5 = 2.2914
const K_TO_K2O  = 1.2046

function kg(v, dec = 1) {
  if (v == null || isNaN(v)) return '—'
  return `${Number(v).toFixed(dec)} kg/ha`
}

function extraerNPK(npkData) {
  if (!npkData) return null
  const lastRec = npkData.recommendations?.at(-1)
  const n = npkData.n ?? lastRec?.n
  const p = npkData.p ?? lastRec?.p
  const k = npkData.k ?? lastRec?.k
  if (n == null && p == null && k == null) return null
  return { n: n ?? 0, p: p ?? 0, k: k ?? 0 }
}

// ── NpkGrid ───────────────────────────────────────────────────────────────────
function NpkGrid({ n, p, k, nRiego = 0 }) {
  const nBruto = (n ?? 0) + nRiego
  const rows = [
    { label: 'N',     primary: nBruto,        puro: null, puroLabel: null },
    { label: 'P₂O₅', primary: pToOxide(p),    puro: p,   puroLabel: 'P' },
    { label: 'K₂O',  primary: kToOxide(k),    puro: k,   puroLabel: 'K' },
  ]
  return (
    <div style={SR.npkGrid}>
      {rows.map(r => (
        <div key={r.label} style={SR.npkCell}>
          <div style={SR.npkElement}>{r.label}</div>
          <div style={SR.npkPuro}>{kg(r.primary)}</div>
          {r.puro != null && (
            <div style={SR.npkOxide}>{r.puroLabel}: {kg(r.puro)}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── CoverageBar ───────────────────────────────────────────────────────────────
function CoverageBar({ label, aportado, necesidad }) {
  if (!necesidad || necesidad <= 0) return null
  const pct   = Math.min(100, (aportado / necesidad) * 100)
  const color = pct >= 100 ? '#2e7d32' : pct >= 70 ? '#e65100' : '#b71c1c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 3 }}>
      <span style={{ width: 34, fontWeight: 700, color: '#1a237e', flexShrink: 0 }}>{label}</span>
      <span style={{ width: 52, textAlign: 'right', fontFamily: 'monospace', color: '#263238', flexShrink: 0 }}>
        {Number(aportado).toFixed(1)}
      </span>
      <span style={{ color: '#90a4ae', flexShrink: 0 }}>/</span>
      <span style={{ width: 52, textAlign: 'right', fontFamily: 'monospace', color: '#546e7a', flexShrink: 0 }}>
        {Number(necesidad).toFixed(1)}
      </span>
      <div style={{ flex: 1, height: 8, background: '#eceff1', borderRadius: 4, overflow: 'hidden', minWidth: 30 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ width: 32, textAlign: 'right', fontWeight: 700, color, flexShrink: 0 }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ResultadosCard({
  npk,
  npkParaRec,
  planItems = [],
  nRiego = 0, pRiego = 0, kRiego = 0,
  cultivo,
  loading,
  error,
  onOpenSativumDialog,
}) {
  if (loading) {
    return <div style={SR.note}>⏳ Calculando necesidades NPK…</div>
  }
  if (error) {
    return (
      <div style={{ ...SR.note, background: '#ffebee', borderColor: '#ef9a9a', color: '#c62828' }}>
        ⚠️ {error}
      </div>
    )
  }
  if (!npk) return null

  const npkValues = extraerNPK(npk)

  // Cobertura del plan actual (en oxide para P/K)
  const aportado = planItems.reduce(
    (acc, item) => {
      const dose = Number(item.cantidad) || 0
      return {
        n:    acc.n    + ((item.n    ?? 0) * dose / 100),
        p2o5: acc.p2o5 + ((item.p2o5 ?? 0) * dose / 100),
        k2o:  acc.k2o  + ((item.k2o  ?? 0) * dose / 100),
      }
    }, { n: 0, p2o5: 0, k2o: 0 }
  )

  // Necesidades brutas en oxide (para las barras de cobertura)
  const nNecesidad    = (npkValues?.n ?? 0) + nRiego
  const p2o5Necesidad = pToOxide(npkValues?.p ?? 0)
  const k2oNecesidad  = kToOxide(npkValues?.k ?? 0)

  const hayPlan = planItems.length > 0

  return (
    <div style={SR.card}>

      {/* Cabecera */}
      <div style={SR.header}>
        <span style={SR.title}>🧮 Necesidades NPK</span>
        {cultivo && <span style={SR.cultivoLabel}>{cultivo.name}</span>}
      </div>

      {/* Grid NPK bruto */}
      {npkValues ? (
        <>
          <NpkGrid {...npkValues} nRiego={nRiego} />
          {(nRiego > 0 || pRiego > 0 || kRiego > 0) && (
            <div style={SR.riegoBox}>
              💧 Cubierto por riego:{' '}
              {nRiego > 0 && <span>N <strong>{nRiego.toFixed(1)} kg/ha</strong></span>}
              {pRiego > 0 && <span>{nRiego > 0 ? ' · ' : ''}P₂O₅ <strong>{(pRiego * P_TO_P2O5).toFixed(1)} kg/ha</strong></span>}
              {kRiego > 0 && <span>{(nRiego > 0 || pRiego > 0) ? ' · ' : ''}K₂O <strong>{(kRiego * K_TO_K2O).toFixed(1)} kg/ha</strong></span>}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#90a4ae', padding: '4px 0' }}>
          No se obtuvieron datos NPK del motor.
        </div>
      )}

      {/* Cobertura del plan */}
      {npkParaRec && hayPlan && (
        <>
          <div style={SR.sectionTitle}>Cobertura del plan</div>
          <div style={{ display: 'flex', fontSize: 9, color: '#90a4ae', marginBottom: 4, gap: 4 }}>
            <span style={{ width: 34 }} />
            <span style={{ width: 52, textAlign: 'right' }}>Aportado</span>
            <span />
            <span style={{ width: 52, textAlign: 'right' }}>Necesidad</span>
            <span style={{ flex: 1 }} />
            <span style={{ width: 32, textAlign: 'right' }}>%</span>
          </div>
          <CoverageBar label="N"     aportado={aportado.n}    necesidad={nNecesidad}    />
          <CoverageBar label="P₂O₅" aportado={aportado.p2o5} necesidad={p2o5Necesidad} />
          <CoverageBar label="K₂O"  aportado={aportado.k2o}  necesidad={k2oNecesidad}  />
          <div style={{ fontSize: 9, color: '#b0bec5', marginTop: 2, marginBottom: 4 }}>
            kg/ha · necesidad bruta (incluye riego)
          </div>
        </>
      )}

      {/* Botón Sativum */}
      {npkParaRec && (
        <button
          type="button"
          onClick={onOpenSativumDialog}
          style={SR.btnSativum}
        >
          + Añadir aplicación Sativum
        </button>
      )}

    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const SR = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  title:        { fontSize: 12, fontWeight: 700, color: '#1a237e' },
  cultivoLabel: { fontSize: 11, color: '#78909c', fontStyle: 'italic' },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', margin: '10px 0 5px',
  },
  note: {
    margin: 12, padding: '8px 12px',
    background: '#fffde7', border: '1px solid #fff59d', borderRadius: 6,
    fontSize: 12, color: '#827717',
  },
  npkGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6,
  },
  npkCell: {
    background: '#f5f7fa', borderRadius: 4, padding: '6px 8px', textAlign: 'center',
  },
  npkElement: { fontSize: 18, fontWeight: 800, color: '#1a237e', lineHeight: 1 },
  npkPuro:    { fontSize: 12, fontWeight: 600, color: '#263238', marginTop: 2 },
  npkOxide:   { fontSize: 10, color: '#78909c', marginTop: 1 },
  riegoBox: {
    fontSize: 11, color: '#01579b',
    background: '#e1f5fe', border: '1px solid #b3e5fc',
    borderRadius: 4, padding: '4px 8px', marginBottom: 6,
  },
  btnSativum: {
    width: '100%', padding: '7px 0', marginTop: 6,
    background: '#1565c0', color: '#fff',
    border: 'none', borderRadius: 4,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
}
