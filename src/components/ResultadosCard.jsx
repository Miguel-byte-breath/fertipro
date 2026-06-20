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

// ── Componente principal ──────────────────────────────────────────────────────

export default function ResultadosCard({
  npk,
  npkParaRec,
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

      {/* Botón Sativum */}
      {npkParaRec && (
        <button
          type="button"
          onClick={onOpenSativumDialog}
          style={SR.btnSativum}
          title="5 propuestas del catálogo Sativum. Ajusta al 100% el nutriente con mayor necesidad pendiente (habitualmente N) y optimiza el equilibrio de los otros dos."
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
