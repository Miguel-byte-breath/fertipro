/**
 * src/components/GeometryPanel.jsx
 *
 * Bloque permanente "Geometría de referencia" en la sidebar.
 *
 * Estado vacío  → explicación de las tres formas de definir la geometría
 *                 sobre la que FertiPRO calculará las necesidades de nutrientes.
 * Estado lleno  → selector "todas / individual" + renombrar + eliminar +
 *                 descargar GeoJSON o Shapefile.
 *
 * Las herramientas de dibujo, edición de vértices, recorte (cutPolygon) y
 * eliminación están en la toolbar del mapa (Geoman).
 */
export default function GeometryPanel({
  polygons,
  activeId,
  onSelect,
  onRename,
  onRemove,
  onDownloadGeoJSON,
  onDownloadSHP,
  onDownloadExcel,
  loadingExcel,
  excelError,
}) {
  const isEmpty = !polygons?.length

  return (
    <div style={S.wrap}>
      <div style={S.title}>📐 Geometría de referencia</div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <FilledState
          polygons={polygons}
          activeId={activeId}
          onSelect={onSelect}
          onRename={onRename}
          onRemove={onRemove}
          onDownloadGeoJSON={onDownloadGeoJSON}
          onDownloadSHP={onDownloadSHP}
          onDownloadExcel={onDownloadExcel}
          loadingExcel={loadingExcel}
          excelError={excelError}
        />
      )}
    </div>
  )
}

// ── Estado vacío: el usuario aún no ha definido ninguna geometría ──────────
function EmptyState() {
  return (
    <>
      <p style={S.intro}>
        Define la unidad de producción, hoja de cultivo o recinto SIGPAC
        sobre el que vas a calcular las necesidades de nutrientes. Tres formas:
      </p>
      <ul style={S.optionList}>
        <li style={S.option}>
          <span style={S.optionIcon}>🗂️</span>
          <div>
            <div style={S.optionTitle}>Cargar archivo</div>
            <div style={S.optionDesc}>GeoJSON o Shapefile (.zip con .shp + .dbf)</div>
          </div>
        </li>
        <li style={S.option}>
          <span style={S.optionIcon}>✏️</span>
          <div>
            <div style={S.optionTitle}>Dibujar en el mapa</div>
            <div style={S.optionDesc}>Herramienta de polígono en la toolbar del mapa</div>
          </div>
        </li>
        <li style={S.option}>
          <span style={S.optionIcon}>🧩</span>
          <div>
            <div style={S.optionTitle}>
              Construir desde recintos SIGPAC
              <span style={S.soonBadge}>Próximamente</span>
            </div>
            <div style={S.optionDesc}>Selecciona uno o varios recintos y FertiPRO los une</div>
          </div>
        </li>
      </ul>
      <div style={S.editHint}>
        Una vez definida, podrás editar vértices, recortar partes con la tijera
        ✂️ o eliminar la geometría completa, todo desde la toolbar del mapa.
      </div>
    </>
  )
}

// ── Estado lleno: gestión de las parcelas ya definidas ────────────────────
function FilledState({
  polygons, activeId, onSelect, onRename, onRemove,
  onDownloadGeoJSON, onDownloadSHP, onDownloadExcel,
  loadingExcel, excelError,
}) {
  const activePoly = activeId != null && activeId !== 'todas'
    ? polygons.find(p => p.id === activeId)
    : null

  // El selector manda en la descarga: si no hay parcela activa (punto libre),
  // los botones quedan deshabilitados.
  const canDownload  = activeId === 'todas' || activePoly != null
  const canExcel     = canDownload && !loadingExcel
  const downloadHint = activeId === 'todas'
    ? `Descargar las ${polygons.length} parcelas`
    : activePoly
      ? `Descargar solo "${activePoly.nombre}"`
      : 'Selecciona una parcela o "Todas las parcelas" para descargar'
  const excelHint = activeId === 'todas'
    ? `Informe SIGPAC de las ${polygons.length} parcelas`
    : activePoly
      ? `Informe SIGPAC de "${activePoly.nombre}"`
      : 'Selecciona una parcela para generar el informe SIGPAC'

  return (
    <>
      <div style={S.subtitle}>
        {polygons.length} {polygons.length === 1 ? 'parcela definida' : 'parcelas definidas'}
      </div>

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

      {activePoly && (
        <div style={S.activeRow}>
          <input
            type="text"
            value={activePoly.nombre ?? ''}
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
        <button
          onClick={onDownloadGeoJSON}
          disabled={!canDownload}
          style={canDownload ? S.actionBtn : S.actionBtnDisabled}
          title={downloadHint}
        >📥 GeoJSON</button>
        <button
          onClick={onDownloadSHP}
          disabled={!canDownload}
          style={canDownload ? S.actionBtn : S.actionBtnDisabled}
          title={downloadHint}
        >📥 Shapefile</button>
      </div>

      <div style={S.actionsRow2}>
        <button
          onClick={onDownloadExcel}
          disabled={!canExcel}
          style={canExcel ? S.actionBtnExcel : S.actionBtnDisabled}
          title={excelHint}
        >
          {loadingExcel ? '⏳ Generando informe…' : '📊 Excel SIGPAC'}
        </button>
      </div>

      {excelError && (
        <div style={S.errorBox}>⚠️ {excelError}</div>
      )}
    </>
  )
}

const S = {
  wrap: {
    margin: 12, padding: 12,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  title: {
    fontSize: 12, fontWeight: 700, color: '#1a237e',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11, color: '#78909c', marginBottom: 8,
  },

  // ── EmptyState ────────────────────────────────────────────────────────
  intro: {
    fontSize: 12, lineHeight: 1.5, color: '#455a64',
    margin: '0 0 10px 0',
  },
  optionList: {
    listStyle: 'none', padding: 0, margin: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  option: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '7px 9px',
    background: '#f5f7fa', borderRadius: 4,
    border: '1px solid #eceff1',
  },
  optionIcon: {
    fontSize: 16, flexShrink: 0, lineHeight: 1.2,
  },
  optionTitle: {
    fontSize: 12, fontWeight: 600, color: '#263238',
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  optionDesc: {
    fontSize: 11, color: '#78909c', marginTop: 1,
  },
  soonBadge: {
    fontSize: 9, fontWeight: 600, color: '#827717',
    background: '#fffde7', border: '1px solid #fff59d',
    padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  editHint: {
    marginTop: 10, padding: '7px 9px',
    background: '#e8eaf6', borderRadius: 4,
    fontSize: 11, color: '#3949ab', lineHeight: 1.5,
  },

  // ── FilledState (UI reorganizada) ─────────────────────────────────────
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
  actionBtnDisabled: {
    flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: 600,
    color: '#b0bec5', background: '#f5f7fa',
    border: '1px solid #eceff1', borderRadius: 4, cursor: 'not-allowed',
  },
  actionsRow2: { display: 'flex', gap: 6, marginTop: 6 },
  actionBtnExcel: {
    flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
    color: '#1b5e20', background: '#e8f5e9',
    border: '1px solid #a5d6a7', borderRadius: 4, cursor: 'pointer',
  },
  errorBox: {
    marginTop: 8, padding: '7px 9px',
    background: '#ffebee', border: '1px solid #ef9a9a',
    borderRadius: 4, fontSize: 11, color: '#c62828',
    whiteSpace: 'pre-line', lineHeight: 1.5,
  },
}
