/**
 * src/components/RecintoCard.jsx
 * Tarjeta con los datos básicos del recinto SIGPAC en el punto/parcela activa.
 */
export default function RecintoCard({ recinto, loading, error }) {
  if (loading) {
    return <div style={S.note}>⏳ Consultando SIGPAC…</div>
  }
  if (error) {
    return <div style={{ ...S.note, color: '#c62828', background: '#ffebee', borderColor: '#ef9a9a' }}>⚠️ {error}</div>
  }
  if (!recinto) {
    return null
  }

  const ref = [
    recinto.provincia,
    recinto.municipio_cod,
    recinto.poligono,
    recinto.parcela,
    recinto.recinto,
  ].filter(v => v != null).join(' / ')

  return (
    <div style={S.card}>
      <div style={S.title}>📍 Recinto SIGPAC</div>
      <Row label="Referencia"   value={ref || '—'} />
      <Row label="Municipio"    value={recinto.municipio ?? '—'} />
      <Row label="Uso"          value={recinto.uso_sigpac ?? '—'} />
      <Row label="Superficie"   value={recinto.superficie_ha != null ? `${recinto.superficie_ha.toFixed(4)} ha` : '—'} />
      <Row label="Pendiente"    value={recinto.pendiente_media != null ? `${recinto.pendiente_media.toFixed(2)} %` : '—'} />
      <Row label="Altitud"      value={recinto.altitud != null ? `${recinto.altitud.toFixed(0)} m` : '—'} />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      <span style={S.val}>{value}</span>
    </div>
  )
}

const S = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  title: { fontSize: 12, fontWeight: 700, color: '#1a237e', marginBottom: 6 },
  row:   {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 12, padding: '3px 0',
    borderBottom: '1px solid #f0f4f7',
  },
  lbl:   { color: '#78909c' },
  val:   { color: '#263238', fontFamily: 'monospace' },
  note:  {
    margin: 12, padding: '8px 12px',
    background: '#fffde7', border: '1px solid #fff59d', borderRadius: 6,
    fontSize: 12, color: '#827717',
  },
}
