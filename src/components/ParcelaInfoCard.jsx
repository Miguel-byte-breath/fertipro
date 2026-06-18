/**
 * src/components/ParcelaInfoCard.jsx
 *
 * Muestra la información SIGPAC de los recintos que intersectan
 * la geometría activa (o el recinto de punto si no hay polígono).
 *
 * Props:
 *   recintos        — array de recintos enriquecidos (de interseccionRecintos o enrichRecintos)
 *                     cada item: { provincia, municipio, poligono, parcela, recinto,
 *                                  uso_sigpac, coef_regadio, superficie_total_ha,
 *                                  superficie_interseccion_ha, pct_ocupado,
 *                                  observacion, enZvn }
 *   loading         — bool — mientras se computan los recintos
 *   error           — string | null
 */

/** Formatea ref SIGPAC como PP-MM-AA-ZZ-PPP-PPP-R */
function fmtRef(r) {
  const pad = (v, n) => String(v ?? 0).padStart(n, '0')
  return [
    pad(r.provincia, 2),
    pad(r.municipio, 2),
    pad(r.agregado ?? 0, 1),
    pad(r.zona ?? 0, 1),
    pad(r.poligono, 3),
    pad(r.parcela, 3),
    pad(r.recinto, 1),
  ].join('-')
}

function fmt(v, dec = 2) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toFixed(dec).replace('.', ',')
}

export default function ParcelaInfoCard({ recintos, loading, error }) {
  // No mostrar nada hasta que haya alguna actividad
  if (!loading && !error && (!recintos || recintos.length === 0)) return null

  const hayZvn = Array.isArray(recintos) && recintos.some(r => r.enZvn)

  return (
    <div style={PC.card}>
      {/* ── Cabecera ──────────────────────────────────────────────────── */}
      <div style={PC.header}>
        <span style={PC.title}>📍 Recintos SIGPAC</span>
        <div style={PC.badges}>
          {Array.isArray(recintos) && recintos.length > 0 && (
            <span style={PC.countBadge}>{recintos.length} recinto{recintos.length !== 1 ? 's' : ''}</span>
          )}
          {hayZvn && (
            <span style={PC.zvnBadge}>⚠ ZVN</span>
          )}
        </div>
      </div>

      {/* ── Alerta ZVN ────────────────────────────────────────────────── */}
      {hayZvn && (
        <div style={PC.zvnAlert}>
          <strong>Zona Vulnerable a Nitratos</strong> — uno o más recintos de esta parcela
          están incluidos en una ZVN (RD 1051/2022). Revisa los condicionantes
          del programa de acción aplicable.
        </div>
      )}

      {/* ── Loading / error ────────────────────────────────────────────── */}
      {loading && (
        <div style={PC.loading}>⏳ Consultando recintos…</div>
      )}
      {error && !loading && (
        <div style={PC.errorBox}>⚠️ {error}</div>
      )}

      {/* ── Tabla de recintos ─────────────────────────────────────────── */}
      {!loading && Array.isArray(recintos) && recintos.length > 0 && (
        <div style={PC.tableWrap}>
          <table style={PC.table}>
            <thead>
              <tr>
                <th style={{ ...PC.th, textAlign: 'left'  }}>Referencia SIGPAC</th>
                <th style={{ ...PC.th, textAlign: 'right' }}>Sup. (ha)</th>
                <th style={{ ...PC.th, textAlign: 'center'}}>Uso</th>
                <th style={{ ...PC.th, textAlign: 'center'}}>ZVN</th>
              </tr>
            </thead>
            <tbody>
              {recintos.map((r, i) => (
                <tr key={i} style={i % 2 === 0 ? PC.trEven : PC.trOdd}>
                  <td style={{ ...PC.td, fontFamily: 'monospace', fontSize: 10 }}>
                    {fmtRef(r)}
                    {r.observacion && r.observacion !== 'Completo' && (
                      <span style={PC.obsBadge}>{r.observacion}</span>
                    )}
                  </td>
                  <td style={{ ...PC.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {r.superficie_interseccion_ha != null
                      ? fmt(r.superficie_interseccion_ha, 4)
                      : r.superficie_total_ha != null
                        ? fmt(r.superficie_total_ha, 4)
                        : '—'}
                  </td>
                  <td style={{ ...PC.td, textAlign: 'center' }}>
                    {r.uso_sigpac
                      ? <span style={PC.usoBadge}>{r.uso_sigpac}</span>
                      : <span style={{ color: '#b0bec5' }}>—</span>}
                  </td>
                  <td style={{ ...PC.td, textAlign: 'center' }}>
                    {r.enZvn
                      ? <span style={PC.zvnYes}>⚠ S</span>
                      : <span style={PC.zvnNo}>N</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const PC = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  title: { fontSize: 12, fontWeight: 700, color: '#1a237e' },
  badges: { display: 'flex', gap: 4, alignItems: 'center' },
  countBadge: {
    fontSize: 10, fontWeight: 600,
    color: '#546e7a', background: '#eceff1',
    border: '1px solid #cfd8dc', borderRadius: 8,
    padding: '1px 6px',
  },
  zvnBadge: {
    fontSize: 10, fontWeight: 700,
    color: '#b71c1c', background: '#ffebee',
    border: '1px solid #ef9a9a', borderRadius: 8,
    padding: '1px 6px', animation: 'none',
  },
  zvnAlert: {
    fontSize: 11, color: '#b71c1c',
    background: '#ffebee', border: '1px solid #ef9a9a',
    borderRadius: 4, padding: '6px 8px', marginBottom: 8,
    lineHeight: 1.45,
  },
  loading: {
    fontSize: 11, color: '#78909c', padding: '4px 0',
  },
  errorBox: {
    fontSize: 11, color: '#c62828',
    background: '#ffebee', border: '1px solid #ef9a9a',
    borderRadius: 4, padding: '4px 8px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: 11,
  },
  th: {
    padding: '4px 6px',
    background: '#eceff1', color: '#546e7a',
    fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 0.3, borderBottom: '1px solid #cfd8dc',
  },
  td: {
    padding: '3px 6px', color: '#37474f', verticalAlign: 'middle',
    borderBottom: '1px solid #f0f4f7',
  },
  trEven: { background: '#fff' },
  trOdd:  { background: '#f8fafc' },
  usoBadge: {
    fontSize: 10, fontWeight: 700,
    color: '#2e7d32', background: '#e8f5e9',
    border: '1px solid #c8e6c9', borderRadius: 3,
    padding: '1px 4px',
  },
  obsBadge: {
    display: 'inline-block', marginLeft: 4,
    fontSize: 9, color: '#e65100',
    background: '#fff3e0', border: '1px solid #ffe0b2',
    borderRadius: 3, padding: '0 3px',
  },
  zvnYes: {
    fontSize: 10, fontWeight: 700, color: '#b71c1c',
  },
  zvnNo: {
    fontSize: 10, color: '#90a4ae',
  },
}
