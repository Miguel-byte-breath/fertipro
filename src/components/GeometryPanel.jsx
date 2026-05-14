/**
 * src/components/GeometryPanel.jsx
 *
 * Bloque permanente "Geometria de referencia" en la sidebar.
 *
 * Estado vacio  -> explicacion de las tres formas de definir la geometria
 *                  sobre la que FertiPRO calculara las necesidades de nutrientes.
 * Estado lleno  -> lista de parcelas con superficie (geom + SigPac), scroll,
 *                  renombrado inline, eliminar, y descargas GeoJSON/SHP/Excel.
 *
 * Las herramientas de dibujo, edicion de vertices, recorte (cutPolygon) y
 * eliminacion estan en la toolbar del mapa (Geoman).
 */
import { useState, useRef, useEffect } from 'react'
import turfArea from '@turf/area'

// Superficie geometrica en ha (calculada con @turf/area sobre el GeoJSON).
function calcSuperficie(feature) {
  try {
    const m2 = turfArea(feature)
    return (m2 / 10000).toFixed(2)
  } catch {
    return null
  }
}

// Suma de superficies intersectadas con SigPac, si ya estan calculadas
// (polygons[i].grupos[*].recintos[*].superficie_ha). Devuelve string con 2
// decimales o null si aun no se ha calculado el intersect.
function calcSuperficieSigpac(parcela) {
  const grupos = parcela.grupos
  if (!Array.isArray(grupos) || grupos.length === 0) return null
  let total = 0
  let count = 0
  for (const g of grupos) {
    for (const r of (g.recintos ?? [])) {
      if (r.superficie_ha != null && !isNaN(r.superficie_ha)) {
        total += Number(r.superficie_ha)
        count++
      }
    }
  }
  if (count === 0) return null
  return total.toFixed(2)
}

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

// ── Estado vacio: el usuario aun no ha definido ninguna geometria ──────────
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

// ── Fila editable de parcela ──────────────────────────────────────────────
function ParcelaRow({ parcela, isActive, onSelect, onRename, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(parcela.nombre ?? '')
  const inputRef              = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const superficie       = calcSuperficie(parcela.feature)
  const superficieSigpac = calcSuperficieSigpac(parcela)

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== parcela.nombre) {
      onRename?.(parcela.id, trimmed)
    } else {
      setDraft(parcela.nombre ?? '')
    }
    setEditing(false)
  }

  return (
    <div
      onClick={() => onSelect?.(String(parcela.id))}
      style={isActive ? S.parcelaRowActive : S.parcelaRow}
    >
      <span style={isActive ? S.dotActive : S.dot} />

      <div style={S.parcelaBody}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setDraft(parcela.nombre ?? ''); setEditing(false) }
            }}
            onClick={e => e.stopPropagation()}
            style={S.parcelaInput}
          />
        ) : (
          <div
            title="Doble clic para editar el nombre"
            onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
            style={isActive ? S.parcelaNameActive : S.parcelaName}
          >
            {parcela.nombre}
          </div>
        )}

        {superficie && (
          <div style={S.parcelaSup}>
            {superficie} ha
            <span style={S.parcelaSupTag}>(geom.)</span>
          </div>
        )}
        {superficieSigpac && (
          <div style={S.parcelaSupSigpac} title="Superficie de intersección con la capa SigPac">
            {superficieSigpac} ha
            <span style={S.parcelaSupSigpacTag}>(SigPac)</span>
          </div>
        )}
      </div>

      <button
        title="Eliminar parcela"
        onClick={e => { e.stopPropagation(); onRemove?.(parcela.id) }}
        style={S.removeBtn}
      >
        ✕
      </button>
    </div>
  )
}

// ── Estado lleno: gestion de las parcelas ya definidas ────────────────────
function FilledState({
  polygons, activeId, onSelect, onRename, onRemove,
  onDownloadGeoJSON, onDownloadSHP, onDownloadExcel,
  loadingExcel, excelError,
}) {
  const activePoly = activeId != null && activeId !== 'todas'
    ? polygons.find(p => p.id === activeId)
    : null

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

  // Totales: superficie geometrica y superficie SigPac (si hay datos)
  const totalGeom = polygons.reduce((sum, p) => {
    const ha = parseFloat(calcSuperficie(p.feature))
    return isNaN(ha) ? sum : sum + ha
  }, 0).toFixed(2)

  const sigpacValues = polygons
    .map(p => parseFloat(calcSuperficieSigpac(p)))
    .filter(v => !isNaN(v))
  const totalSigpac = sigpacValues.length > 0
    ? sigpacValues.reduce((s, v) => s + v, 0).toFixed(2)
    : null

  return (
    <>
      <div style={S.subtitle}>
        {polygons.length} {polygons.length === 1 ? 'parcela definida' : 'parcelas definidas'}
        {' · '}
        <span style={S.totalGeom}>{totalGeom} ha</span>
        {totalSigpac && (
          <>
            {' / '}
            <span style={S.totalSigpac}>{totalSigpac} ha SigPac</span>
          </>
        )}
      </div>

      {/* Opcion "Todas las parcelas" */}
      <div
        onClick={() => onSelect?.('todas')}
        style={activeId === 'todas' ? S.todasActive : S.todas}
      >
        <span style={activeId === 'todas' ? S.dotActive : S.dot} />
        <span style={S.todasLabel}>📐 Todas las parcelas</span>
        <span style={S.todasTotal}>
          {totalGeom} ha{totalSigpac && <> / <span style={S.totalSigpac}>{totalSigpac} SigPac</span></>}
        </span>
      </div>

      {/* Lista vertical con scroll */}
      <div style={S.parcelaList}>
        {polygons.map(p => (
          <ParcelaRow
            key={p.id}
            parcela={p}
            isActive={activeId === p.id}
            onSelect={onSelect}
            onRename={onRename}
            onRemove={onRemove}
          />
        ))}
      </div>

      {/* Descargas */}
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
  totalGeom:   { color: '#78909c', fontWeight: 600 },
  totalSigpac: { color: '#2e7d32', fontWeight: 600 },

  // EmptyState
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

  // "Todas las parcelas"
  todas: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', marginBottom: 4,
    background: '#fff', border: '1px solid #e8eaf6', borderRadius: 5,
    cursor: 'pointer', fontSize: 12, color: '#424242',
  },
  todasActive: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', marginBottom: 4,
    background: '#e8eaf6', border: '1px solid #9fa8da', borderRadius: 5,
    cursor: 'pointer', fontSize: 12, color: '#1a237e', fontWeight: 600,
  },
  todasLabel: { flex: 1 },
  todasTotal: { fontSize: 10, color: '#78909c' },

  // Lista de parcelas con scroll
  parcelaList: {
    maxHeight: 220, overflowY: 'auto',
    border: '1px solid #eceff1', borderRadius: 4,
    padding: 4, marginBottom: 8,
  },
  parcelaRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', marginBottom: 4,
    background: '#fff', border: '1px solid #eceff1', borderRadius: 5,
    cursor: 'pointer', transition: 'background 0.12s',
  },
  parcelaRowActive: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', marginBottom: 4,
    background: '#e8eaf6', border: '1px solid #9fa8da', borderRadius: 5,
    cursor: 'pointer', transition: 'background 0.12s',
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: '#cfd8dc',
  },
  dotActive: {
    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
    background: '#3949ab',
  },
  parcelaBody: { flex: 1, minWidth: 0 },
  parcelaName: {
    fontSize: 12, color: '#424242',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  parcelaNameActive: {
    fontSize: 12, color: '#1a237e', fontWeight: 600,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  parcelaInput: {
    width: '100%', fontSize: 12, padding: '2px 5px',
    border: '1px solid #9fa8da', borderRadius: 3,
    outline: 'none', background: '#fff',
  },
  parcelaSup: {
    fontSize: 10, color: '#78909c', marginTop: 1,
  },
  parcelaSupTag: { marginLeft: 4, color: '#b0bec5', fontSize: 9 },
  parcelaSupSigpac: { fontSize: 10, color: '#2e7d32' },
  parcelaSupSigpacTag: { marginLeft: 4, color: '#81c784', fontSize: 9 },
  removeBtn: {
    flexShrink: 0,
    background: 'none', border: 'none',
    cursor: 'pointer', padding: '2px 4px',
    color: '#ef9a9a', fontSize: 14, lineHeight: 1,
    borderRadius: 3,
  },

  // Botones de descarga
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