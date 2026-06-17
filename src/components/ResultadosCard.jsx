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

// Extrae n/p/k de la respuesta del algo.
// La API devuelve recommendations[] con un item por cultivo de la rotación;
// el ÚLTIMO siempre corresponde al cultivo actual (objetivo del plan).
function extraerNPK(npkData) {
  if (!npkData) return null
  const lastRec = npkData.recommendations?.at(-1)
  const n = npkData.n ?? lastRec?.n
  const p = npkData.p ?? lastRec?.p
  const k = npkData.k ?? lastRec?.k
  if (n == null && p == null && k == null) return null
  return { n: n ?? 0, p: p ?? 0, k: k ?? 0 }
}

// ── componentes internos ──────────────────────────────────────────────────────

function NpkGrid({ n, p, k }) {
  // Primario: N (kg N/ha), P₂O₅ (kg P₂O₅/ha), K₂O (kg K₂O/ha) — estándar sectorial
  // Secundario (gris): P puro, K puro — referencia técnica
  const rows = [
    { label: 'N',     primary: n,              puro: null,  puroLabel: null },
    { label: 'P₂O₅', primary: pToOxide(p),    puro: p,     puroLabel: 'P' },
    { label: 'K₂O',  primary: kToOxide(k),    puro: k,     puroLabel: 'K' },
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

function FertilizerRow({ fert, index }) {
  // Los fertilizantes de /recommendation tienen:
  //   quantity  → dosis a aplicar (kg/ha)
  //   n/p2o5/k2o → % de composición del producto
  // El aporte real = composición% × dosis / 100
  const name        = fert.name ?? fert.shortName ?? `Fertilizante ${index + 1}`
  const dose        = fert.quantity
  const appliedN    = dose != null ? fert.n    * dose / 100 : null
  const appliedP2O5 = dose != null ? fert.p2o5 * dose / 100 : null
  const appliedK2O  = dose != null ? fert.k2o  * dose / 100 : null

  return (
    <div style={SR.fertRow}>
      <div style={SR.fertName}>{name}</div>
      <div style={SR.fertNums}>
        {dose != null && <span style={SR.fertDose}>{Number(dose).toFixed(0)} kg/ha</span>}
        <span style={SR.fertNpk}>
          N {kg(appliedN, 0)} · P₂O₅ {kg(appliedP2O5, 0)} · K₂O {kg(appliedK2O, 0)}
        </span>
      </div>
    </div>
  )
}

function RecomendacionItem({ rec, index }) {
  // La respuesta de /recommendation es un array de propuestas:
  //   [ { unique: [ ...fertilizantes ], observations: "string|null" }, ... ]
  // 'unique' = fertilizantes de esta propuesta (1 para simples, 2-3 para mezclas)
  const fertilizers = rec.unique ?? []
  const obs         = rec.observations ?? null

  return (
    <div style={SR.recItem}>
      <div style={SR.recHeader}>Opción {index + 1}</div>
      {fertilizers.map((f, i) => (
        <FertilizerRow key={i} fert={f} index={i} />
      ))}
      {obs && <div style={SR.obsItem}>{obs}</div>}
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export default function ResultadosCard({ npk, recomendacion, adjustedNutrient = 'N', pRiego = 0, kRiego = 0, cultivo, loading, error }) {

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

  const npkValues = extraerNPK(npk)
  // /recommendation devuelve un array de propuestas: [{ unique: [...], observations: "" }, ...]
  const recList   = Array.isArray(recomendacion) ? recomendacion : []

  return (
    <div style={SR.card}>

      {/* ── Cabecera ───────────────────────────────────────────────────── */}
      <div style={SR.header}>
        <span style={SR.title}>🧮 Necesidades NPK</span>
        {cultivo && <span style={SR.cultivoLabel}>{cultivo.name}</span>}
      </div>

      {/* ── NPK necesario ─────────────────────────────────────────────── */}
      {npkValues ? (
        <>
          <NpkGrid {...npkValues} />
          {(pRiego > 0 || kRiego > 0) && (
            <div style={SR.riegoBox}>
              💧 Cubierto por riego:{' '}
              {pRiego > 0 && <span>P₂O₅ <strong>{(pRiego * 2.2914).toFixed(1)} kg/ha</strong></span>}
              {kRiego > 0 && <span>{pRiego > 0 ? ' · ' : ''}K₂O <strong>{(kRiego * 1.2046).toFixed(1)} kg/ha</strong></span>}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#90a4ae', padding: '4px 0' }}>
          No se obtuvieron datos NPK del motor.
        </div>
      )}

      {/* ── Combinaciones de fertilizantes ────────────────────────────── */}
      {recList.length > 0 ? (
        <>
          <div style={SR.sectionTitle}>
            Combinaciones recomendadas
            <span style={SR.adjBadge}>ajustado a {adjustedNutrient} al 100%</span>
          </div>
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
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', margin: '10px 0 5px',
  },
  adjBadge: {
    fontSize: 9, fontWeight: 600, textTransform: 'none', letterSpacing: 0,
    color: '#1565c0', background: '#e3f2fd', border: '1px solid #bbdefb',
    borderRadius: 8, padding: '1px 6px',
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
  recHeader: { fontSize: 11, fontWeight: 700, color: '#3949ab', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 },
  tipoBadge: { fontSize: 9, fontWeight: 600, color: '#4a148c', background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: 8, padding: '1px 6px' },
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

  // Cobertura riego
  riegoBox: {
    fontSize: 11, color: '#01579b',
    background: '#e1f5fe', border: '1px solid #b3e5fc',
    borderRadius: 4, padding: '4px 8px', marginBottom: 6,
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
