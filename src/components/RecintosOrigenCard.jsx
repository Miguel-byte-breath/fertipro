/**
 * src/components/RecintosOrigenCard.jsx
 *
 * Tarjeta que se muestra cuando la parcela activa fue construida a partir de
 * recintos SIGPAC (via "Construir hoja desde recintos SIGPAC"). Lista la
 * composicion exacta de la hoja: referencia catastral, uso, superficie,
 * pendiente y altitud de cada recinto origen.
 *
 * Esa metadata sirve al motor de calculo FertiPRO para aplicar criterios
 * agronomicos diferenciados (p.ej. si un recinto cae en ZVN, el criterio
 * mas restrictivo se aplica a toda la hoja).
 */
export default function RecintosOrigenCard({ recintos }) {
  if (!Array.isArray(recintos) || !recintos.length) return null

  const totalSup = recintos
    .map(r => Number(r.superficie_ha) || 0)
    .reduce((a, b) => a + b, 0)

  return (
    <div style={S.card}>
      <div style={S.title}>
        🧩 Recintos SIGPAC ({recintos.length})
        <span style={S.totalSup}>{totalSup.toFixed(2)} ha</span>
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Referencia</th>
              <th style={S.thNum}>Uso</th>
              <th style={S.thNum}>Sup.</th>
              <th style={S.thNum}>Pdt.</th>
              <th style={S.thNum}>Alt.</th>
            </tr>
          </thead>
          <tbody>
            {recintos.map((r, i) => (
              <tr key={i}>
                <td style={S.td}>
                  {r.provincia}/{r.municipio}/{r.poligono}/{r.parcela}/{r.recinto}
                </td>
                <td style={S.tdNum}>{r.uso_sigpac ?? '—'}</td>
                <td style={S.tdNum}>{fmt(r.superficie_ha, 2)}</td>
                <td style={S.tdNum}>{fmt(r.pendiente_media, 1, '%')}</td>
                <td style={S.tdNum}>{fmt(r.altitud, 0, ' m')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v, dec = 2, suffix = '') {
  if (v == null) return <span style={{ color: '#bdbdbd' }}>—</span>
  return `${Number(v).toFixed(dec)}${suffix}`
}

const S = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  title: {
    fontSize: 12, fontWeight: 700, color: '#1a237e',
    marginBottom: 8,
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  },
  totalSup: {
    fontSize: 11, fontWeight: 600, color: '#2962ff', fontFamily: 'monospace',
  },
  tableWrap: { overflowX: 'auto' },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    textAlign: 'left', padding: '4px 6px',
    fontWeight: 600, color: '#546e7a',
    borderBottom: '1px solid #cfd8dc', fontSize: 10,
  },
  thNum: {
    textAlign: 'right', padding: '4px 6px',
    fontWeight: 600, color: '#546e7a',
    borderBottom: '1px solid #cfd8dc', fontSize: 10,
  },
  td: {
    padding: '3px 6px', borderBottom: '1px solid #f0f4f7',
    fontFamily: 'monospace', color: '#37474f',
  },
  tdNum: {
    padding: '3px 6px', borderBottom: '1px solid #f0f4f7',
    fontFamily: 'monospace', textAlign: 'right', color: '#263238',
  },
}
