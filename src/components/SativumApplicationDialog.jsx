/**
 * src/components/SativumApplicationDialog.jsx
 *
 * Modal para añadir una aplicación de fertilizante a partir del catálogo
 * Sativum. El usuario fija qué porcentaje del total NPK quiere cubrir en
 * esta aplicación, la API devuelve 5 opciones y el usuario elige una.
 *
 * Props:
 *   npkParaRec       — { n, p, k } en elemento puro (kg/ha), después de riego
 *   planItems        — items ya en el plan (para calcular lo ya cubierto)
 *   adjustedNutrient — 'N'|'P'|'K' sugerido por el motor (arranque de sliders)
 *   onAdd(items)     — callback con array de items a añadir al plan
 *   onClose()        — callback para cerrar sin añadir
 */
import { useState, useMemo, useCallback } from 'react'
import { getRecomendacion, pToOxide, kToOxide } from '../api/sativum-fertilizers'

const P_TO_P2O5 = 2.2914
const K_TO_K2O  = 1.2046

function fmt1(v) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toFixed(1)
}

// ── SliderRow ─────────────────────────────────────────────────────────────────
// Muestra un nutriente con:
//   • marcador izquierdo (ya cubierto, read-only)
//   • slider derecho (target del usuario)
//   • texto "Ya cubierto X%. Quiero cubrir Y kg/ha (Z% del total)"
function SliderRow({ label, total, covered, target, onTarget }) {
  if (!total || total <= 0) return null

  const covPct  = Math.min(100, (covered / total) * 100)
  const tgtPct  = target   // target ya es % del total
  const deltaPct = Math.max(0, tgtPct - covPct)
  const deltaKg  = (deltaPct / 100) * total

  return (
    <div style={SD.sliderWrap}>
      <div style={SD.sliderHeader}>
        <span style={SD.sliderLabel}>{label}</span>
        <span style={SD.sliderTotal}>{fmt1(total)} kg/ha</span>
      </div>

      {/* Track con dos marcadores */}
      <div style={{ position: 'relative', margin: '6px 0 2px' }}>
        {/* Barra de fondo */}
        <div style={SD.track} />
        {/* Tramo ya cubierto (azul claro) */}
        <div style={{ ...SD.trackFilled, width: `${covPct}%`, background: '#90caf9' }} />
        {/* Tramo a cubrir en esta aplicación (azul oscuro) */}
        <div style={{
          ...SD.trackFilled,
          left: `${covPct}%`,
          width: `${Math.min(deltaPct, 100 - covPct)}%`,
          background: '#1565c0',
        }} />
        {/* Marcador izquierdo (ya cubierto) */}
        <div style={{ ...SD.marker, left: `${covPct}%`, background: '#42a5f5' }}>
          <span style={SD.markerLabel}>{Math.round(covPct)}%</span>
        </div>
        {/* Slider target */}
        <input
          type="range"
          min={Math.ceil(covPct)}
          max={100}
          step={1}
          value={Math.max(Math.ceil(covPct), tgtPct)}
          onChange={e => onTarget(Number(e.target.value))}
          style={SD.rangeInput}
        />
      </div>

      <div style={SD.sliderInfo}>
        Ya cubierto: <strong>{Math.round(covPct)}%</strong>
        {' · '}Quiero cubrir: <strong>{fmt1(deltaKg)} kg/ha</strong>
        {' '}({Math.round(deltaPct)}% de {fmt1(total)} kg/ha total)
      </div>
    </div>
  )
}

// ── OpcionRow ─────────────────────────────────────────────────────────────────
function OpcionRow({ rec, index, selected, onSelect }) {
  const ferts = rec.unique ?? []
  const obs   = rec.observations ?? null
  return (
    <label style={{ ...SD.opcionRow, background: selected ? '#e8eaf6' : '#fafbff', cursor: 'pointer' }}>
      <input
        type="radio"
        name="sativum-opcion"
        checked={selected}
        onChange={() => onSelect(index)}
        style={{ marginRight: 6, flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={SD.opcionTitle}>Opción {index + 1}</div>
        {ferts.map((f, i) => {
          const dose = f.quantity ?? 0
          return (
            <div key={i} style={SD.fertLine}>
              <span style={SD.fertName}>{f.name ?? `Fertilizante ${i + 1}`}</span>
              <span style={SD.fertNums}>
                {Number(dose).toFixed(0)} kg/ha
                {' · '}N {fmt1(f.n * dose / 100)}
                {' · '}P₂O₅ {fmt1(f.p2o5 * dose / 100)}
                {' · '}K₂O {fmt1(f.k2o * dose / 100)} kg/ha
              </span>
            </div>
          )
        })}
        {obs && <div style={SD.obsLine}>{obs}</div>}
      </div>
    </label>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SativumApplicationDialog({
  npkParaRec,
  planItems = [],
  adjustedNutrient = 'N',
  onAdd,
  onClose,
}) {
  // Lo ya cubierto por el plan actual (en oxide para P y K, elemento para N)
  const covered = useMemo(() => planItems.reduce(
    (acc, item) => {
      const dose = Number(item.cantidad) || 0
      return {
        n:    acc.n    + ((item.n    ?? 0) * dose / 100),
        p2o5: acc.p2o5 + ((item.p2o5 ?? 0) * dose / 100),
        k2o:  acc.k2o  + ((item.k2o  ?? 0) * dose / 100),
      }
    }, { n: 0, p2o5: 0, k2o: 0 }
  ), [planItems])

  // Totales en unidades de display
  const nTotal    = npkParaRec?.n ?? 0
  const p2o5Total = pToOxide(npkParaRec?.p ?? 0)
  const k2oTotal  = kToOxide(npkParaRec?.k ?? 0)

  const covPctN    = nTotal    > 0 ? Math.min(100, (covered.n    / nTotal)    * 100) : 0
  const covPctP2o5 = p2o5Total > 0 ? Math.min(100, (covered.p2o5 / p2o5Total) * 100) : 0
  const covPctK2o  = k2oTotal  > 0 ? Math.min(100, (covered.k2o  / k2oTotal)  * 100) : 0

  // Sliders (% del total que el usuario quiere alcanzar tras esta aplicación)
  const [tgtN,    setTgtN]    = useState(() => Math.min(100, Math.round(covPctN)    + 20))
  const [tgtP2o5, setTgtP2o5] = useState(() => Math.min(100, Math.round(covPctP2o5) + 20))
  const [tgtK2o,  setTgtK2o]  = useState(() => Math.min(100, Math.round(covPctK2o)  + 20))

  // Delta en kg/ha para la llamada a la API
  const deltaN    = Math.max(0, ((tgtN    - covPctN)    / 100) * nTotal)
  const deltaP2o5 = Math.max(0, ((tgtP2o5 - covPctP2o5) / 100) * p2o5Total)
  const deltaK2o  = Math.max(0, ((tgtK2o  - covPctK2o)  / 100) * k2oTotal)
  const deltaP    = deltaP2o5 / P_TO_P2O5
  const deltaK    = deltaK2o  / K_TO_K2O

  const [loading,  setLoading]  = useState(false)
  const [options,  setOptions]  = useState(null)   // null = no llamado aún
  const [apiError, setApiError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [fecha,    setFecha]    = useState('')

  const handleCalcOptions = useCallback(async () => {
    if (deltaN <= 0 && deltaP <= 0 && deltaK <= 0) return
    setLoading(true)
    setOptions(null)
    setSelected(null)
    setApiError(null)
    try {
      const npkDelta    = { n: deltaN, p: deltaP, k: deltaK }
      const pOx = deltaP * P_TO_P2O5
      const kOx = deltaK * K_TO_K2O
      const adjNutrient = (deltaN >= pOx && deltaN >= kOx && deltaN > 0) ? 'N'
        : (pOx >= deltaN && pOx >= kOx && pOx > 0) ? 'P'
        : (kOx > 0) ? 'K'
        : adjustedNutrient
      const data = await getRecomendacion(npkDelta, { adjustedNutrient: adjNutrient })
      setOptions(Array.isArray(data) ? data : [])
    } catch (err) {
      setApiError(err.message || 'Error consultando la API Sativum.')
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [deltaN, deltaP, deltaK, adjustedNutrient])

  const handleAdd = useCallback(() => {
    if (selected == null || !options) return
    const rec   = options[selected]
    const ferts = rec.unique ?? []
    if (ferts.length === 0) return
    const grupoId = Date.now()
    const items = ferts.map((f, i) => ({
      id:              grupoId + i,
      origen:          'sativum',
      nombre:          f.name ?? f.shortName ?? `Fertilizante Sativum ${i + 1}`,
      tipo:            f.type ?? '',
      tipoSIEX:        null,
      n:               f.n    ?? 0,
      p2o5:            f.p2o5 ?? 0,
      k2o:             f.k2o  ?? 0,
      cantidad:        f.quantity ?? 0,
      fechaAplicacion: fecha || null,
      esPersonalizado: false,
    }))
    onAdd(items)
  }, [selected, options, fecha, onAdd])

  const canAdd = selected != null && options != null && options.length > 0

  return (
    // Overlay
    <div style={SD.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={SD.modal}>

        <div style={SD.modalHeader}>
          <span style={SD.modalTitle}>Ajuste de porcentaje de nutrientes a cubrir</span>
          <button type="button" onClick={onClose} style={SD.closeBtn}>×</button>
        </div>

        <div style={SD.modalBody}>
          {/* Fecha de aplicación — primero, antes de calcular */}
          <div style={{ marginBottom: 12 }}>
            <label style={SD.dateLabel}>Fecha de aplicación</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={{ ...SD.dateInput, width: 160 }}
            />
          </div>

          <p style={SD.intro}>
            Ajusta los deslizadores para fijar qué porcentaje del NPK total quieres cubrir
            en esta aplicación. El marcador azul claro indica lo ya cubierto por el plan.
          </p>

          <SliderRow label="N"    total={nTotal}    covered={covered.n}    target={tgtN}    onTarget={setTgtN}    />
          <SliderRow label="P₂O₅" total={p2o5Total} covered={covered.p2o5} target={tgtP2o5} onTarget={setTgtP2o5} />
          <SliderRow label="K₂O"  total={k2oTotal}  covered={covered.k2o}  target={tgtK2o}  onTarget={setTgtK2o}  />

          <button
            type="button"
            onClick={handleCalcOptions}
            disabled={loading || (deltaN <= 0 && deltaP <= 0 && deltaK <= 0)}
            style={{
              ...SD.btnCalc,
              opacity: (loading || (deltaN <= 0 && deltaP <= 0 && deltaK <= 0)) ? 0.5 : 1,
              cursor:  (loading || (deltaN <= 0 && deltaP <= 0 && deltaK <= 0)) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ Consultando Sativum…' : '🔍 Calcular opciones Sativum'}
          </button>

          {apiError && (
            <div style={SD.errorBox}>{apiError}</div>
          )}

          {options !== null && options.length === 0 && !apiError && (
            <div style={SD.warnBox}>
              Sativum no devolvió opciones para estos valores. Prueba a ajustar los porcentajes.
            </div>
          )}

          {options !== null && options.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={SD.opcionesTitle}>Elige una opción:</div>
              {options.map((rec, i) => (
                <OpcionRow
                  key={i}
                  rec={rec}
                  index={i}
                  selected={selected === i}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}

        </div>

        <div style={SD.modalFooter}>
          <button type="button" onClick={onClose} style={SD.btnCancel}>CANCELAR</button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            style={{ ...SD.btnAdd, opacity: canAdd ? 1 : 0.45, cursor: canAdd ? 'pointer' : 'not-allowed' }}
          >
            ACEPTAR
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const SD = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
    width: 480, maxWidth: '96vw',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', borderBottom: '1px solid #e0e6ed',
    background: '#f5f7fa',
  },
  modalTitle: { fontSize: 13, fontWeight: 700, color: '#1a237e' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 20, color: '#90a4ae', lineHeight: 1, padding: '0 2px',
  },
  modalBody: {
    flex: 1, overflowY: 'auto', padding: '12px 16px',
  },
  modalFooter: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '10px 16px', borderTop: '1px solid #e0e6ed',
    background: '#f5f7fa',
  },
  intro: {
    fontSize: 11, color: '#546e7a', lineHeight: 1.5, marginBottom: 12,
  },

  // Slider row
  sliderWrap: { marginBottom: 14 },
  sliderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderLabel: { fontSize: 13, fontWeight: 700, color: '#1a237e' },
  sliderTotal: { fontSize: 11, color: '#78909c' },
  track: {
    position: 'absolute', top: '50%', left: 0, right: 0,
    height: 6, background: '#eceff1', borderRadius: 3,
    transform: 'translateY(-50%)',
  },
  trackFilled: {
    position: 'absolute', top: '50%', height: 6, borderRadius: 3,
    transform: 'translateY(-50%)',
  },
  marker: {
    position: 'absolute', top: '50%', width: 14, height: 14,
    borderRadius: '50%', transform: 'translate(-50%, -50%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  markerLabel: {
    position: 'absolute', top: -16, fontSize: 9, fontWeight: 700,
    color: '#1565c0', whiteSpace: 'nowrap',
  },
  rangeInput: {
    position: 'absolute', top: '50%', left: 0, width: '100%',
    transform: 'translateY(-50%)',
    WebkitAppearance: 'none', appearance: 'none',
    background: 'transparent', height: 20,
    cursor: 'pointer', zIndex: 3, margin: 0, padding: 0,
  },
  sliderInfo: {
    fontSize: 10, color: '#546e7a', marginTop: 4,
  },

  // Botones
  btnCalc: {
    width: '100%', padding: '8px 0', marginTop: 6,
    background: '#1565c0', color: '#fff',
    border: 'none', borderRadius: 4,
    fontSize: 12, fontWeight: 600,
  },
  btnCancel: {
    padding: '7px 18px', background: 'none',
    border: '1px solid #cfd8dc', borderRadius: 4,
    fontSize: 12, fontWeight: 600, color: '#546e7a', cursor: 'pointer',
  },
  btnAdd: {
    padding: '7px 20px',
    background: '#2e7d32', color: '#fff',
    border: 'none', borderRadius: 4,
    fontSize: 12, fontWeight: 700,
  },

  // Opciones
  opcionesTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.5, color: '#546e7a', marginBottom: 6,
  },
  opcionRow: {
    display: 'flex', alignItems: 'flex-start',
    border: '1px solid #e8eaf6', borderRadius: 4,
    padding: '7px 8px', marginBottom: 5,
  },
  opcionTitle: {
    fontSize: 11, fontWeight: 700, color: '#3949ab', marginBottom: 3,
  },
  fertLine: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'baseline', fontSize: 11, gap: 6, marginBottom: 1,
  },
  fertName: { fontWeight: 600, color: '#263238', flex: 1 },
  fertNums: { color: '#78909c', fontSize: 10, whiteSpace: 'nowrap' },
  obsLine:  { fontSize: 10, color: '#e65100', background: '#fff3e0', borderRadius: 3, padding: '2px 6px', marginTop: 3 },

  // Fecha
  dateLabel: {
    fontSize: 9, color: '#78909c', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.3,
    display: 'block', marginBottom: 3,
  },
  dateInput: {
    padding: '4px 6px', fontSize: 11,
    border: '1px solid #cfd8dc', borderRadius: 4,
    fontFamily: 'inherit', color: '#263238',
  },

  // Mensajes
  errorBox: {
    marginTop: 6, fontSize: 11, color: '#b71c1c',
    background: '#ffebee', border: '1px solid #ef9a9a',
    borderRadius: 4, padding: '6px 8px',
  },
  warnBox: {
    marginTop: 6, fontSize: 11, color: '#e65100',
    background: '#fff3e0', border: '1px solid #ffe0b2',
    borderRadius: 4, padding: '6px 8px',
  },
}
