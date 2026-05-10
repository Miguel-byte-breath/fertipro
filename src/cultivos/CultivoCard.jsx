/**
 * src/cultivos/CultivoCard.jsx
 *
 * Tarjeta de detalle del cultivo seleccionado:
 *   - Categoría, familia botánica, fijador de N
 *   - Parámetros (ms_pct, hi_pct, residuos_pct, beta, ef, efr)
 *   - Tabla de nutrientes (parte comercial + parte no comercial)
 *
 * Renderiza `nd` para los valores `null` (no determinado).
 */

const NUTRIENTES = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Fe', 'Cu', 'Mn', 'Zn', 'B', 'Mo']

function fmt(v, dec = 3) {
  if (v == null) return <span style={{ color: '#bdbdbd' }}>nd</span>
  if (v === 0)   return '0'
  return Number(v).toFixed(dec)
}

export default function CultivoCard({ cultivo }) {
  if (!cultivo) {
    return (
      <div style={{ padding: '14px 12px', fontSize: 12, color: '#90a4ae', fontStyle: 'italic' }}>
        Selecciona un cultivo para ver sus extracciones por nutriente.
      </div>
    )
  }

  const { params, parte_comercial: pc, parte_no_comercial: pnc } = cultivo

  return (
    <div style={S.card}>
      <div style={S.header}>
        <div>
          <div style={S.title}>{cultivo.nombre}</div>
          <div style={S.subtitle}>
            {cultivo.categoria}
            {cultivo.familia_botanica ? ` · ${cultivo.familia_botanica}` : ''}
          </div>
        </div>
        {cultivo.n_fijado && (
          <span style={S.badge}>🌱 Fijador N</span>
        )}
      </div>

      {/* ── Parámetros agronómicos ────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Parámetros</div>
        <div style={S.paramsGrid}>
          <Param label="MS"        value={params.ms_pct}       suffix="%" />
          <Param label="HI"        value={params.hi_pct}       suffix="%" />
          <Param label="Residuos"  value={params.residuos_pct} suffix="%" />
          <Param label="β (beta)"  value={params.beta} />
          <Param label="EF"        value={params.ef} />
          <Param label="EFR"       value={params.efr} />
        </div>
      </div>

      {/* ── Tabla de nutrientes ───────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Nutrientes (% sobre MS)</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Nutriente</th>
              <th style={S.th}>{pc?.organo ?? 'comercial'}</th>
              <th style={S.th}>{pnc?.organo ?? 'no comercial'}</th>
            </tr>
          </thead>
          <tbody>
            {NUTRIENTES.map(n => (
              <tr key={n}>
                <td style={S.tdLabel}>{n}</td>
                <td style={S.td}>{fmt(pc?.nutrientes_pct?.[n])}</td>
                <td style={S.td}>{fmt(pnc?.nutrientes_pct?.[n])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Param({ label, value, suffix = '' }) {
  return (
    <div style={S.paramItem}>
      <div style={S.paramLabel}>{label}</div>
      <div style={S.paramValue}>
        {value == null
          ? <span style={{ color: '#bdbdbd' }}>nd</span>
          : `${Number(value).toFixed(suffix === '%' ? 1 : 2)}${suffix}`}
      </div>
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
    fontSize: 10, fontWeight: 600, color: '#2e7d32',
    background: '#e8f5e9', border: '1px solid #c8e6c9',
    padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap',
  },
  section:      { marginBottom: 10 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', marginBottom: 6,
  },
  paramsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
  },
  paramItem: {
    background: '#f5f7fa', borderRadius: 4, padding: '5px 8px',
  },
  paramLabel: { fontSize: 10, color: '#78909c' },
  paramValue: { fontSize: 12, fontWeight: 600, color: '#263238' },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:      {
    textAlign: 'left', padding: '4px 6px',
    fontWeight: 600, color: '#546e7a',
    borderBottom: '1px solid #cfd8dc', fontSize: 11,
  },
  td:      { padding: '3px 6px', borderBottom: '1px solid #f0f4f7', fontFamily: 'monospace' },
  tdLabel: { padding: '3px 6px', borderBottom: '1px solid #f0f4f7', fontWeight: 600, color: '#37474f' },
}
