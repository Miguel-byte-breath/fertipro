/**
 * src/components/GeometryPanel.jsx
 *
 * Panel ligero de gestión de parcelas:
 *  - Selector "todas las parcelas" / parcela individual
 *  - Renombrar / eliminar parcela
 *  - Descargar GeoJSON / Shapefile
 *
 * Solo se renderiza cuando hay al menos un polígono.
 */
export default function GeometryPanel({
  polygons,
  activeId,
  onSelect,
  onRename,
  onRemove,
  onDownloadGeoJSON,
  onDownloadSHP,
}) {
  if (!polygons?.length) return null

  return (
    <div style={S.wrap}>
      <div style={S.row}>
        <select
          value={activeId ?? ''}
          onChange={e => onSelect?.(e.target.value)}
          style={S.select}
        >
          <option value="">— Punto libre —</option>
          <option value="todas">Todas las parcelas ({polygons.length})</option>
          {polygons.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {activeId != null && activeId !== 'todas' && (
        <div style={S.activeRow}>
          <input
            type="text"
            value={polygons.find(p => p.id === activeId)?.nombre ?? ''}
            onChange={e => onRename?.(activeId, e.target.value)}
            style={S.input}
          />
          <button
            onClick={() => onRemove?.(activeId)}
            title="Eliminar parcela"
            style={S.iconBtn}
          >🗑️</button>
        </div>
      )}

      <div style={S.actions}>
        <button onClick={onDownloadGeoJSON} style={S.actionBtn} title="Descargar GeoJSON">
          📥 GeoJSON
        </button>
        <button onClick={onDownloadSHP} style={S.actionBtn} title="Descargar Shapefile (ZIP)">
          📥 Shapefile
        </button>
      </div>
    </div>
  )
}

const S = {
  wrap: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  row:       { display: 'flex', gap: 6 },
  select:    { flex: 1, padding: '6px 8px', fontSize: 12, border: '1px solid #cfd8dc', borderRadius: 4, fontFamily: 'inherit' },
  activeRow: { display: 'flex', gap: 4, marginTop: 6 },
  input:     { flex: 1, padding: '5px 8px', fontSize: 12, border: '1px solid #cfd8dc', borderRadius: 4, fontFamily: 'inherit' },
  iconBtn:   { background: '#fff', border: '1px solid #cfd8dc', borderRadius: 4, padding: '0 8px', cursor: 'pointer' },
  actions:   { display: 'flex', gap: 6, marginTop: 8 },
  actionBtn: {
    flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: 600,
    color: '#1a237e', background: '#e8eaf6',
    border: '1px solid #c5cae9', borderRadius: 4, cursor: 'pointer',
  },
}
