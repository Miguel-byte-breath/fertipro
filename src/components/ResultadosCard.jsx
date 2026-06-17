/**
 * src/components/ResultadosCard.jsx
 *
 * Muestra el resultado del cálculo NPK (FertiliCalc) y las recomendaciones
 * de combinaciones de fertilizantes.
 *
 * Props:
 *   npk          — respuesta cruda de /algo/ (objeto con .n .p .k mínimo)
 *   recomendacion — respuesta de /recommendation
 *                   { recommendations: [...], observations: [...] }
 *   cultivo      — objeto cultivo (para contexto en cabecera)
 *   loading      — bool
 *   error        — string | null
 *
 * Conversiones de unidades:
 *   P y K llegan en elemento puro desde /algo/.
 *   Se muestran también en forma de óxido (P₂O₅, K₂O) que es el estándar sectorial.
 */
import { pToOxide, kToOxide } from '../api/sativum-fertilizers'

// ── helpers ───────────────────────────────────────────────────────────────────

function kg(v, dec = 1) {
  if (v == null || isNaN(v)) return '—'
  return `${Number(v).toFixed(dec)} kg/ha`
}

// Extrae n/p/k de la respuesta del algo, que puede venir en distintos niveles
function extraerNPK(npkData) {
  if (!npkData) return null
  // Intenta top-level primero; luego dentro de recommendations[0]
  const n = npkData.n ?? npkData.recommendations?.[0]?.n
  const p = npkData.p ?? npkData.recommendations?.[0]?.p
  const k = npkData.k ?? npkData.recommendations?.[0]?.k
  if (n == null && p == null && k == null) return null
  return { n: n ?? 0, p: p ?? 0, k: k ?? 0 }
}

// ── componentes internos ──────────────────────────────────────────────────────

function NpkGrid({ n, p, k }) {
  const rows = [
    { label: 'N',    puro: n,    oxide: null,         unit: 'kg N/ha' },
    { label: 'P',    puro: p,    oxide: pToOxide(p),  unit: 'kg P/ha' },
    { label: 'K',    puro: k,    oxide: kToOxide(k),  unit: 'kg K/ha' },
  ]
  return (
    <div style={SR.npkGrid}>
      {rows.map(r => (
        <div key={r.label} style={SR.npkCell}>
          <div style={SR.npkElement}>{r.label}</div>
          <div style={SR.npkPuro}>{kg(r.puro)}</div>
          {r.oxide != null && (
            <div style={SR.npkOxide}>
              {r.label === 'P' ? 'P₂O₅' : 'K₂O'}: {kg(r.oxide)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function FertilizerRow({ fert, index }) {
  // Cada item en recommendations[i].fertilizers puede tener distintos shapes
  // según la versión del API. Intentamos cubrir los campos más comunes.
  const name  = fert.name ?? fert.fertilizer?.name ?? `Fertilizante ${index + 1}`
  const dose  = fert.dose ?? fert.quantity ?? fert.appliedQuantity
  const n     = fert.n    ?? fert.appliedN
  const p     = fert.p    ?? fert.appliedP   // elemento puro
  const k     = fert.k    ?? fert.appliedK

  return (
    <div style={SR.fertRow}>
      <div style={SR.fertName}>{name}</div>
      <div style={SR.fertNums}>
        {dose != null && <span style={SR.fertDose}>{Number(dose).toFixed(0)} kg/ha</span>}
        <span style={SR.fertNpk}>
          N {kg(n, 0)} · P {kg(p, 0)} · K {kg(k, 0)}
        </span>
      </div>
    </div>
  )
}

function RecomendacionItem({ rec, index }) {
  const fertilizers   = rec.fertilizers ?? []
  const totalApplied  = rec.totalApplied ?? rec.total ?? null

  return (
    <div style={SR.recItem}>
      <div style={SR.recHeader}>Combinación {index + 1}</div>
      {fertilizers.map((f, i) => (
        <FertilizerRow key={i} fert={f} index={i} />
      ))}
      {totalApplied && (
        <div style={SR.recTotal}>
          Total aplicado — N: {kg(totalApplied.n)} · P₂O₅: {kg(pToOxide(totalApplied.p ?? 0))} · K₂O: {kg(kToOxide(totalApplied.k ?? 0))}
        </div>
      )}
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export default function ResultadosCard({ npk, recomendacion, cultivo, loading, error }) {

  if (loading) {
    return (
      <div style={SR.note}>
        ⏳ Calculando necesidades NPK…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...SR.note, background: '#ffebee', borderColor: '#ef9a9a', color: '#c62828' }}>
        ⚠️ {error}
      </div>
    )
  }

  if (!npk && !recomendacion) return null

  const npkValues    = extraerNPK(npk)
  const recList      = recomendacion?.recommendations ?? []
  const observations = recomendacion?.observations    ?? []

  return (
    <div style={SR.card}>

      {/* ── Cabecera ───────────────────────────────────────────────────── */}
      <div style={SR.header}>
        <span style={SR.title}>🧮 Necesidades NPK</span>
        {cultivo && <span style={SR.cultivoLabel}>{cultivo.name}</span>}
      </div>

      {/* ── NPK necesario ─────────────────────────────────────────────── */}
      {npkValues ? (
        <NpkGrid {...npkValues} />
      ) : (
        <div style={{ fontSize: 11, color: '#90a4ae', padding: '4px 0' }}>
          No se obtuvieron datos NPK del motor.
        </div>
      )}

      {/* ── Combinaciones de fertilizantes ────────────────────────────── */}
      {recList.length > 0 ? (
        <>
          <div style={SR.sectionTitle}>Combinaciones recomendadas</div>
          {recList.map((rec, i) => (
            <RecomendacionItem key={i} rec={rec} index={i} />
          ))}
        </>
      ) : (
        <div style={SR.warnBox}>
          {recomendacion === null
            ? '⚠️ No se pudo obtener la recomendación de fertilizantes. Revisa la consola del navegador para más detalle.'
            : '⚠️ Sativum no devolvió combinaciones de fertilizantes para estos valores NPK.'}
        </div>
      )}

      {/* ── Observaciones ─────────────────────────────────────────────── */}
      {observations.length > 0 && (
        <>
          <div style={SR.sectionTitle}>Observaciones</div>
          {observations.map((obs, i) => (
            <div key={i} style={SR.obsItem}>
              {typeof obs === 'string' ? obs : obs.message ?? JSON.stringify(obs)}
            </div>
          ))}
        </>
      )}

    </div>
  )
}

// ── estilos ───────────────────────────────────────────────────────────────────

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
  title:       { fontSize: 12, fontWeight: 700, color: '#1a237e' },
  cultivoLabel:{ fontSize: 11, color: '#78909c', fontStyle: 'italic' },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', margin: '10px 0 5px',
  },
  note: {
    margin: 12, padding: '8px 12px',
    background: '#fffde7', border: '1px solid #fff59d', borderRadius: 6,
    fontSize: 12, color: '#827717',
  },

  // NPK grid
  npkGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6,
  },
  npkCell: {
    background: '#f5f7fa', borderRadius: 4, padding: '6px 8px', textAlign: 'center',
  },
  npkElement: { fontSize: 18, fontWeight: 800, color: '#1a237e', lineHeight: 1 },
  npkPuro:    { fontSize: 12, fontWeight: 600, color: '#263238', marginTop: 2 },
  npkOxide:   { fontSize: 10, color: '#78909c', marginTop: 1 },

  // Fertilizantes
  recItem: {
    border: '1px solid #e8eaf6', borderRadius: 4,
    padding: '6px 8px', marginBottom: 6,
    background: '#fafbff',
  },
  recHeader: { fontSize: 11, fontWeight: 700, color: '#3949ab', marginBottom: 4 },
  fertRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '2px 0', borderBottom: '1px solid #f0f4f7', fontSize: 11,
  },
  fertName: { color: '#263238', fontWeight: 600, flex: 1, marginRight: 6 },
  fertNums: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
  fertDose: { fontFamily: 'monospace', color: '#1a237e', fontWeight: 700, fontSize: 12 },
  fertNpk:  { color: '#78909c', fontSize: 10 },
  recTotal: {
    marginTop: 4, fontSize: 10, color: '#2e7d32',
    background: '#e8f5e9', borderRadius: 3, padding: '2px 6px',
  },

  // Aviso sin recomendación
  warnBox: {
    marginTop: 6, fontSize: 11, color: '#b71c1c',
    background: '#ffebee', border: '1px solid #ef9a9a',
    borderRadius: 4, padding: '6px 8px',
  },

  // Observaciones
  obsItem: {
    fontSize: 11, color: '#e65100',
    background: '#fff3e0', border: '1px solid #ffe0b2',
    borderRadius: 4, padding: '4px 8px', marginBottom: 3,
  },
}
