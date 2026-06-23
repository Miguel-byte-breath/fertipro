/**
 * PlanRiegoModal.jsx
 *
 * Modal con el plan semanal de riego devuelto por SIG Riego Pro.
 * Muestra programacion_semanal + balance_mensual + botón exportar PDF.
 *
 * Props:
 *   planRiego   — { ok, redistribucion_termica, programacion_semanal[], balance_mensual[], estacion? }
 *   cultivo     — objeto Sativum ({ name, ... })
 *   fechaIni    — 'YYYY-MM-DD'
 *   fechaFin    — 'YYYY-MM-DD'
 *   onClose     — () => void
 *   onExportarPdf — () => void
 */

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 1200, overflowY: 'auto', padding: '32px 16px',
  },
  modal: {
    background: '#fff', borderRadius: 8, width: '100%', maxWidth: 760,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
  },
  header: {
    background: '#1565c0', color: '#fff',
    padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 15, fontWeight: 700, flex: 1, margin: 0 },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  closeBtn: {
    background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
    fontSize: 20, lineHeight: 1, padding: '0 4px',
  },
  body:    { padding: '16px 20px' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#1565c0', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, borderBottom: '1px solid #e3eaf5',
    paddingBottom: 4,
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: 12,
  },
  th: {
    background: '#e3eaf5', color: '#1a3a6b', fontWeight: 700,
    padding: '5px 10px', textAlign: 'right', borderBottom: '2px solid #c5d5ea',
    whiteSpace: 'nowrap',
  },
  thLeft: {
    background: '#e3eaf5', color: '#1a3a6b', fontWeight: 700,
    padding: '5px 10px', textAlign: 'left', borderBottom: '2px solid #c5d5ea',
  },
  td: {
    padding: '4px 10px', textAlign: 'right', borderBottom: '1px solid #eef2f8',
    color: '#222',
  },
  tdLeft: {
    padding: '4px 10px', textAlign: 'left', borderBottom: '1px solid #eef2f8',
    color: '#222',
  },
  badge: {
    display: 'inline-block', padding: '2px 7px', borderRadius: 10,
    fontSize: 10, fontWeight: 700, marginLeft: 8,
  },
  badgeGreen:  { background: '#e8f5e9', color: '#2e7d32' },
  badgeOrange: { background: '#fff3e0', color: '#e65100' },
  footer: {
    padding: '12px 20px', borderTop: '1px solid #e3eaf5',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
  },
  btnPdf: {
    background: '#1565c0', color: '#fff', border: 'none', borderRadius: 5,
    padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  btnClose: {
    background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 5,
    padding: '7px 16px', cursor: 'pointer', fontSize: 13,
  },
  metaRow: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { fontSize: 12, color: '#555' },
  metaLabel: { fontWeight: 700, color: '#333', marginRight: 4 },
}

function fmt(v, dec = 0) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function PlanRiegoModal({ planRiego, cultivo, fechaIni, fechaFin, onClose, onExportarPdf }) {
  if (!planRiego) return null

  const { redistribucion_termica, programacion_semanal = [], balance_mensual = [], estacion } = planRiego

  const totalRiego = programacion_semanal.reduce((s, r) => s + (r.riego_neto_m3ha || 0), 0)

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* Cabecera */}
        <div style={S.header}>
          <div style={{ flex: 1 }}>
            <div style={S.headerTitle}>Plan de Riego Semanal</div>
            <div style={S.headerSub}>
              {cultivo?.name || '—'} · {fmtFecha(fechaIni)} – {fmtFecha(fechaFin)}
              {estacion && ` · Estación SIAR: ${estacion}`}
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose} title="Cerrar">×</button>
        </div>

        <div style={S.body}>

          {/* Metadatos */}
          <div style={S.metaRow}>
            <span style={S.metaItem}>
              <span style={S.metaLabel}>Riego total:</span>
              {fmt(totalRiego)} m³/ha
            </span>
            <span style={S.metaItem}>
              <span style={S.metaLabel}>Redistribución térmica:</span>
              <span style={{ ...S.badge, ...(redistribucion_termica ? S.badgeGreen : S.badgeOrange) }}>
                {redistribucion_termica ? 'Activa' : 'No aplicada'}
              </span>
            </span>
            <span style={S.metaItem}>
              <span style={S.metaLabel}>Semanas con riego:</span>
              {programacion_semanal.filter(r => r.riego_neto_m3ha > 0).length} de {programacion_semanal.length}
            </span>
          </div>

          {/* Tabla semanal */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Programación semanal</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Semana</th>
                  <th style={S.thLeft}>Período</th>
                  <th style={S.th}>Riego neto (m³/ha)</th>
                </tr>
              </thead>
              <tbody>
                {programacion_semanal.map((row, i) => (
                  <tr key={i} style={row.riego_neto_m3ha === 0 ? { color: '#aaa' } : {}}>
                    <td style={S.td}>{row.semana}</td>
                    <td style={S.tdLeft}>{row.fecha_ini} – {row.fecha_fin}</td>
                    <td style={{ ...S.td, fontWeight: row.riego_neto_m3ha > 0 ? 600 : 400, color: row.riego_neto_m3ha > 0 ? '#1565c0' : '#bbb' }}>
                      {row.riego_neto_m3ha > 0 ? fmt(row.riego_neto_m3ha) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#e3eaf5', fontWeight: 700 }}>
                  <td style={S.td} colSpan={2}>TOTAL</td>
                  <td style={{ ...S.td, color: '#1565c0' }}>{fmt(totalRiego)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Balance mensual */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Balance hídrico mensual</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.thLeft}>Mes</th>
                    <th style={S.th}>ETo (mm/día)</th>
                    <th style={S.th}>Kc</th>
                    <th style={S.th}>ETc (mm)</th>
                    <th style={S.th}>P (mm)</th>
                    <th style={S.th}>Pe (mm)</th>
                    <th style={S.th}>NHN (m³/ha)</th>
                    <th style={S.th}>Asignado (m³/ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {balance_mensual.map((row, i) => (
                    <tr key={i}>
                      <td style={S.tdLeft}>{row.mes}</td>
                      <td style={S.td}>{fmt(row.eto_mm_dia, 2)}</td>
                      <td style={S.td}>{fmt(row.kc, 2)}</td>
                      <td style={S.td}>{fmt(row.etc_mm, 0)}</td>
                      <td style={S.td}>{fmt(row.p_mm, 1)}</td>
                      <td style={S.td}>{fmt(row.pe_mm, 1)}</td>
                      <td style={{ ...S.td, color: row.nhn_m3ha > 0 ? '#c62828' : '#aaa' }}>{fmt(row.nhn_m3ha)}</td>
                      <td style={{ ...S.td, color: row.asignado_m3ha > 0 ? '#1565c0' : '#aaa', fontWeight: 600 }}>{fmt(row.asignado_m3ha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
              NHN = Necesidad Hídrica Neta (ETc − Pe) · Pe = Precipitación efectiva · Datos climáticos: SIAR MAPA
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnClose} onClick={onClose}>Cerrar</button>
          <button style={S.btnPdf} onClick={onExportarPdf}>⬇ Exportar PDF</button>
        </div>

      </div>
    </div>
  )
}
