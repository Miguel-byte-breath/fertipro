/**
 * src/components/SueloRiegoCard.jsx
 *
 * Tarjeta combinada de análisis de suelo + agua de riego.
 *
 * Sección 1 — Análisis de suelo:
 *   Toggle ArcGIS Sativum / Laboratorio propio.
 *   Modo ArcGIS: campos read-only (MO, Textura, pH, P Olsen, K suelo).
 *   Modo Laboratorio: mismos campos editables, pre-rellenos con valores ArcGIS.
 *     + Ref. boletín (texto libre).
 *     Textura: el usuario elige la clase FAO/USDA (12 clases, la habitual en
 *       cualquier boletín de análisis de suelo) — NUNCA "textura simplificada"
 *       directamente, ese esquema de 6 clases es un artefacto interno de
 *       Sativum/ITACyL que el usuario no tiene forma de relacionar con su
 *       boletín. El campo operativo que viaja a la API (`sueloPersonalizado
 *       .soilType`, enum SANDY|SANDY_LOAM|LOAM|SILTY_LOAM|CLAY_LOAM|CLAY) se
 *       deriva en silencio de la clase FAO/USDA elegida vía el campo
 *       `soilTypeSimplified` que ya trae cada entrada de soilTypes.json —
 *       mismo mapeo 12→6 que usa `normalizarSuelo()` para el modo ArcGIS,
 *       verificado además contra la leyenda real del MapServer de ITACyL
 *       (servicios.itacyl.es/arcgis/rest/services/API_de_Suelos/MapServer/legend).
 *   CEC (meq/kg): siempre editable.
 *
 * Sección 2 — Agua de riego:
 *   Toggle Secano / Regadío.
 *   Si cultivo.irrigation > 0 → Regadío por defecto + dotación pre-rellena.
 *   Cuando Regadío:
 *     Origen del agua (SIEX 1-6) + Ref. análisis agua (texto libre).
 *     Dotación m³/ha (con nota orientativa si viene de Sativum).
 *     NO₃, P, K siempre visibles:
 *       - Subterránea → NO₃ y K desde ArcGIS (read-only); P manual.
 *       - Otro origen → los tres manuales.
 *     Recuadro informativo de UF aportadas por riego.
 *
 * Props:
 *   suelo                      — resultado de normalizarSuelo() | null
 *   loading                    — bool
 *   cec                        — number (meq/kg)
 *   onCecChange                — (value: number) => void
 *   riego                      — { sistemaExplotacion, fuenteId, refAnalisisAgua, no3MgL, dotacionM3, pMgL, kMgL }
 *   onRiegoChange              — (riego) => void
 *   analisisPropio             — bool
 *   onAnalisisPropioChange     — (bool) => void
 *   refAnalisisSuelo           — string
 *   onRefAnalisisSueloChange   — (string) => void
 *   sueloPersonalizado         — object { soilType, soilTypeUsdaValue, organicMatter, ph, pOlsen, kSoil }
 *     soilType          — enum SANDY|SANDY_LOAM|LOAM|SILTY_LOAM|CLAY_LOAM|CLAY, operativo (viaja a la API)
 *     soilTypeUsdaValue — 1-12, lo que el usuario elige realmente en modo laboratorio;
 *                         soilType se deriva de este vía soilTypes.json.soilTypeSimplified
 *   onSueloPersonalizadoChange — (obj) => void
 *   cultivoIrrigation          — number (m³/ha orientativo del cultivo, 0 si no aplica)
 */
import { useEffect } from 'react'
import { FUENTES_AGUA, FUENTE_SUBTERRANEA } from '../data/sativum/fuentesAgua'
import soilTypesSimpl from '../data/sativum/soilTypesSimpl.json'
import soilTypes from '../data/sativum/soilTypes.json'

// Opciones de origen de agua (excluye id=0 "Sin riego" — lo gestiona el toggle Secano/Regadío)
const FUENTES_AGUA_REGADIO = FUENTES_AGUA.filter(f => f.id !== 0)

const SOIL_LABEL = Object.fromEntries(
  soilTypesSimpl.map(s => [s.descNutrients, s.description])
)

// value FAO/USDA (1-12) → descNutrients Sativum (SANDY|SANDY_LOAM|LOAM|SILTY_LOAM|CLAY_LOAM|CLAY)
// vía el join key soilTypeSimplified que ya trae cada entrada de soilTypes.json.
const SIMPL_BY_VALUE = Object.fromEntries(soilTypesSimpl.map(s => [s.value, s.descNutrients]))
function soilTypeDesdeUsda(usdaValue) {
  const entry = soilTypes.find(t => t.value === Number(usdaValue))
  return entry ? SIMPL_BY_VALUE[entry.soilTypeSimplified] : null
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v, dec = 2) {
  if (v == null || isNaN(v)) return null
  return Number(v).toFixed(dec)
}

// ── componentes internos ──────────────────────────────────────────────────────

function SectionTitle({ icon, label }) {
  return (
    <div style={S.titleRow}>
      <span style={S.title}>{icon} {label}</span>
    </div>
  )
}

function Row({ label, value, unit }) {
  return (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      {value != null
        ? <span style={S.val}>{value}{unit ? <span style={S.unit}> {unit}</span> : null}</span>
        : <span style={S.nd}>nd</span>}
    </div>
  )
}

function InputRow({ label, value, unit, onChange, min, max, step = 1, placeholder = '', readOnly = false, badge = null }) {
  return (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={e => !readOnly && onChange?.(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ ...S.numInput, ...(readOnly ? S.numInputReadOnly : {}) }}
        />
        {unit && <span style={S.unit}>{unit}</span>}
        {badge && <span style={S.arcgisBadge}>{badge}</span>}
      </span>
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export default function SueloRiegoCard({
  suelo,
  loading,
  cec,
  onCecChange,
  riego,
  onRiegoChange,
  analisisPropio,
  onAnalisisPropioChange,
  refAnalisisSuelo,
  onRefAnalisisSueloChange,
  sueloPersonalizado,
  onSueloPersonalizadoChange,
  cultivoIrrigation = 0,
}) {
  const sistemaExplotacion = riego?.sistemaExplotacion ?? 'secano'
  const fuenteId           = riego?.fuenteId ?? 0
  const esRegadio          = sistemaExplotacion === 'regadio'
  const esSubterr          = fuenteId === FUENTE_SUBTERRANEA

  // Auto-rellenar NO₃ y K desde ArcGIS cuando fuente = subterránea.
  //
  // Un solo efecto para los dos campos, a propósito: antes había dos useEffect
  // separados (uno por NO₃, otro por K) que, al llegar juntos desde la misma
  // respuesta ArcGIS, disparaban en el mismo commit y cada uno llamaba a
  // onRiegoChange (=setRiego, reemplazo total del objeto, no merge) leyendo el
  // mismo `riego` obsoleto del cierre. El segundo efecto en pisar "ganaba" y el
  // campo del primero (no3MgL) se perdía siempre — confirmado con una
  // reproducción real en React (jsdom) y con los números de la app: en modo
  // subterránea, K2O se descontaba bien pero el N mostrado en "Necesidades
  // NPK" salía a 0 (mismo bug ya arreglado en fertipro, ver su CLAUDE.md).
  useEffect(() => {
    if (!esSubterr) return
    const next = {}
    if (suelo?.no3Irrigation != null) next.no3MgL = suelo.no3Irrigation
    if (suelo?.kIrrigation != null) next.kMgL = suelo.kIrrigation
    if (Object.keys(next).length > 0) {
      onRiegoChange({ ...riego, ...next })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esSubterr, suelo?.no3Irrigation, suelo?.kIrrigation])

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleToggleAnalisis(propio) {
    // Pre-rellenar con valores ArcGIS SOLO la primera vez que se entra en modo laboratorio
    // (sueloPersonalizado todavía vacío) — no en cada reentrada. Antes se sobreescribía
    // sueloPersonalizado con los valores ArcGIS actuales cada vez que se volvía a pulsar
    // "Laboratorio propio" (la condición era `propio && !analisisPropio`, que vuelve a ser
    // cierta en cada reentrada), borrando silenciosamente cualquier edición manual del
    // usuario en cuanto alternaba entre las dos pestañas. Confirmado por Miguel: los valores
    // introducidos en análisis propio se restablecían al cambiar a ArcGIS y volver.
    const yaPersonalizado = sueloPersonalizado && Object.keys(sueloPersonalizado).length > 0
    if (propio && !analisisPropio && !yaPersonalizado) {
      onSueloPersonalizadoChange({
        soilType:          suelo?.soilType          ?? 'LOAM',
        soilTypeUsdaValue: suelo?.soilTypeUsdaPixel  ?? '',
        organicMatter:     suelo?.organicMatter      ?? '',
        ph:                suelo?.ph                 ?? '',
        pOlsen:            suelo?.pOlsen             ?? '',
        kSoil:             suelo?.kSoil              ?? '',
      })
    }
    onAnalisisPropioChange(propio)
  }

  function handleToggleSistema(sistema) {
    if (sistema === 'secano') {
      onRiegoChange({ ...riego, sistemaExplotacion: 'secano', fuenteId: 0 })
    } else {
      onRiegoChange({ ...riego, sistemaExplotacion: 'regadio' })
    }
  }

  function handleFuenteChange(id) {
    // Al cambiar fuente, limpiar NO₃ y K para que se recargen desde ArcGIS si procede
    onRiegoChange({ ...riego, fuenteId: id, no3MgL: '', kMgL: '' })
  }

  function setSueloProp(field, value) {
    onSueloPersonalizadoChange({ ...sueloPersonalizado, [field]: value })
  }

  // ── loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={S.note}>⏳ Consultando datos de suelo…</div>
  }

  // ── cálculo UF aportadas por riego ───────────────────────────────────────
  const no3Val = esSubterr ? (suelo?.no3Irrigation ?? riego?.no3MgL) : riego?.no3MgL
  const dot    = Number(riego?.dotacionM3) || 0
  const pVal   = Number(riego?.pMgL)  || 0
  const kVal   = esSubterr ? (Number(suelo?.kIrrigation) || 0) : (Number(riego?.kMgL) || 0)

  const nAgua  = (no3Val && dot) ? (Number(no3Val) * dot * 0.001 * (14 / 62)).toFixed(1) : null
  const p2o5   = (pVal && dot)   ? (pVal * dot * 0.001 * 2.2914).toFixed(1)              : null
  const k2o    = (kVal && dot)   ? (kVal * dot * 0.001 * 1.2046).toFixed(1)              : null

  const texLabel = suelo?.soilType ? SOIL_LABEL[suelo.soilType] ?? suelo.soilType : null

  // Nota dotación orientativa: se muestra si el valor coincide con cultivo.irrigation
  const dotacionEsSativum = cultivoIrrigation > 0 && Number(riego?.dotacionM3) === cultivoIrrigation

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.card}>

      {/* ══ SECCIÓN SUELO ══════════════════════════════════════════════════ */}
      <SectionTitle icon="🌱" label="Análisis de suelo" />

      {/* Toggle fuente de datos de suelo */}
      <div style={{ ...S.row, borderBottom: 'none', paddingBottom: 6 }}>
        <span style={S.lbl}>Fuente datos suelo</span>
        <div style={S.toggleGroup}>
          <button
            style={{ ...S.toggleBtn, ...(!analisisPropio ? S.toggleBtnActive : {}) }}
            onClick={() => handleToggleAnalisis(false)}
          >
            ArcGIS Sativum
          </button>
          <button
            style={{ ...S.toggleBtn, ...(analisisPropio ? S.toggleBtnActive : {}) }}
            onClick={() => handleToggleAnalisis(true)}
          >
            Laboratorio propio
          </button>
        </div>
      </div>

      {/* Ref. boletín análisis — solo en modo laboratorio */}
      {analisisPropio && (
        <div style={S.row}>
          <span style={S.lbl}>Ref. boletín análisis</span>
          <input
            type="text"
            value={refAnalisisSuelo}
            placeholder="p.ej. LAB-2024-001"
            onChange={e => onRefAnalisisSueloChange(e.target.value)}
            style={S.textInput}
          />
        </div>
      )}

      {/* Textura USDA oficial — solo en modo ArcGIS */}
      {!analisisPropio && (
        <Row label="Textura (USDA oficial)" value={suelo?.soilTypeUsdaLabel ?? null} />
      )}

      {/* Textura — FAO/USDA (12 clases) en laboratorio, textura simplificada de solo lectura en ArcGIS.
          En laboratorio el usuario nunca ve "textura simplificada" (esquema interno de Sativum/ITACyL
          sin relación evidente con un boletín real) — elige la clase FAO/USDA de su análisis y el
          soilType operativo (el que viaja a la API) se deriva en silencio vía soilTypeDesdeUsda(). */}
      {analisisPropio ? (
        <div style={S.row}>
          <span style={S.lbl}>Clase textural FAO/USDA</span>
          <select
            value={sueloPersonalizado?.soilTypeUsdaValue ?? ''}
            onChange={e => {
              const usdaValue = e.target.value === '' ? '' : Number(e.target.value)
              onSueloPersonalizadoChange({
                ...sueloPersonalizado,
                soilTypeUsdaValue: usdaValue,
                soilType: soilTypeDesdeUsda(usdaValue) ?? sueloPersonalizado?.soilType ?? 'LOAM',
              })
            }}
            style={S.select}
          >
            <option value="">— seleccionar —</option>
            {soilTypes.map(t => (
              <option key={t.value} value={t.value}>{t.description}</option>
            ))}
          </select>
        </div>
      ) : (
        <Row label="Textura simplificada" value={texLabel} />
      )}

      {/* MO */}
      <InputRow
        label="Materia orgánica"
        value={analisisPropio ? (sueloPersonalizado?.organicMatter ?? '') : fmtNum(suelo?.organicMatter, 2)}
        unit="%"
        readOnly={!analisisPropio}
        step={0.1} min={0} max={20} placeholder="0.0"
        onChange={v => setSueloProp('organicMatter', v)}
      />

      {/* pH */}
      <InputRow
        label="pH"
        value={analisisPropio ? (sueloPersonalizado?.ph ?? '') : fmtNum(suelo?.ph, 1)}
        readOnly={!analisisPropio}
        step={0.1} min={3} max={10} placeholder="0.0"
        onChange={v => setSueloProp('ph', v)}
      />

      {/* P Olsen */}
      <InputRow
        label="P Olsen"
        value={analisisPropio ? (sueloPersonalizado?.pOlsen ?? '') : fmtNum(suelo?.pOlsen, 1)}
        unit="ppm"
        readOnly={!analisisPropio}
        step={0.5} min={0} placeholder="0.0"
        onChange={v => setSueloProp('pOlsen', v)}
      />

      {/* K suelo */}
      <InputRow
        label="K suelo"
        value={analisisPropio ? (sueloPersonalizado?.kSoil ?? '') : fmtNum(suelo?.kSoil, 0)}
        unit="ppm"
        readOnly={!analisisPropio}
        step={5} min={0} placeholder="0"
        onChange={v => setSueloProp('kSoil', v)}
      />

      {/* CEC — siempre editable */}
      <InputRow
        label="CEC"
        value={cec}
        unit="meq/kg"
        step={5} min={50} max={600}
        onChange={onCecChange}
      />

      {/* ══ SECCIÓN AGUA DE RIEGO ══════════════════════════════════════════ */}
      <div style={{ marginTop: 12 }}>
        <SectionTitle icon="💧" label="Agua de riego" />
      </div>

      {/* Toggle Sistema de explotación */}
      <div style={{ ...S.row, borderBottom: 'none', paddingBottom: 6 }}>
        <span style={S.lbl}>Sistema de explotación</span>
        <div style={S.toggleGroup}>
          <button
            style={{ ...S.toggleBtn, ...(!esRegadio ? S.toggleBtnActive : {}) }}
            onClick={() => handleToggleSistema('secano')}
          >
            Secano
          </button>
          <button
            style={{ ...S.toggleBtn, ...(esRegadio ? S.toggleBtnActive : {}) }}
            onClick={() => handleToggleSistema('regadio')}
          >
            Regadío
          </button>
        </div>
      </div>

      {esRegadio && (
        <>
          {/* Origen del agua (SIEX) */}
          <div style={S.row}>
            <span style={S.lbl}>Origen del agua (SIEX)</span>
            <select
              value={fuenteId}
              onChange={e => handleFuenteChange(Number(e.target.value))}
              style={S.select}
            >
              <option value={0}>— seleccionar —</option>
              {FUENTES_AGUA_REGADIO.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Ref. análisis agua */}
          <div style={S.row}>
            <span style={S.lbl}>Ref. análisis agua</span>
            <input
              type="text"
              value={riego?.refAnalisisAgua ?? ''}
              placeholder="p.ej. ANA-2024-042"
              onChange={e => onRiegoChange({ ...riego, refAnalisisAgua: e.target.value })}
              style={S.textInput}
            />
          </div>

          {/* Dotación */}
          <div style={S.rowCol}>
            <div style={{ ...S.row, borderBottom: 'none' }}>
              <span style={S.lbl}>Dotación riego</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={riego?.dotacionM3 ?? ''}
                  min={0} step={50}
                  placeholder="0"
                  onChange={e => onRiegoChange({ ...riego, dotacionM3: e.target.value === '' ? '' : Number(e.target.value) })}
                  style={S.numInput}
                />
                <span style={S.unit}>m³/ha</span>
              </span>
            </div>
            {dotacionEsSativum && (
              <div style={S.dotacionNota}>
                Orientativo Sativum · ajusta según disponibilidad hídrica
              </div>
            )}
          </div>

          {/* NO₃ */}
          <InputRow
            label="NO₃ agua riego"
            value={esSubterr ? (suelo?.no3Irrigation ?? '') : (riego?.no3MgL ?? '')}
            unit="mg/L"
            readOnly={esSubterr}
            badge={esSubterr ? 'ArcGIS' : null}
            step={0.1} min={0} placeholder="0.0"
            onChange={v => onRiegoChange({ ...riego, no3MgL: v })}
          />

          {/* P */}
          <InputRow
            label="P agua riego"
            value={riego?.pMgL ?? ''}
            unit="mg/L"
            step={0.1} min={0} placeholder="0.0"
            onChange={v => onRiegoChange({ ...riego, pMgL: v })}
          />

          {/* K */}
          <InputRow
            label="K agua riego"
            value={esSubterr ? (suelo?.kIrrigation ?? '') : (riego?.kMgL ?? '')}
            unit="mg/L"
            readOnly={esSubterr}
            badge={esSubterr ? 'ArcGIS' : null}
            step={0.1} min={0} placeholder="0.0"
            onChange={v => onRiegoChange({ ...riego, kMgL: v })}
          />

          {/* UF aportadas por riego */}
          {dot > 0 && (nAgua || p2o5 || k2o) && (
            <div style={S.infoBox}>
              <span style={{ fontWeight: 600 }}>Aportado por riego:</span>
              {nAgua && <span> N <strong>{nAgua} kg/ha</strong></span>}
              {p2o5  && <span>{nAgua ? ' ·' : ''} P₂O₅ <strong>{p2o5} kg/ha</strong></span>}
              {k2o   && <span>{(nAgua || p2o5) ? ' ·' : ''} K₂O <strong>{k2o} kg/ha</strong></span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── estilos ───────────────────────────────────────────────────────────────────

const S = {
  card: {
    margin: 12, padding: 10,
    background: '#fff', border: '1px solid #e0e6ed', borderRadius: 6,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  titleRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 4,
  },
  title: { fontSize: 12, fontWeight: 700, color: '#1a237e' },
  toggleGroup: {
    display: 'flex', gap: 0,
  },
  toggleBtn: {
    fontSize: 11, padding: '3px 10px',
    border: '1px solid #cfd8dc',
    background: '#f5f7fa', color: '#78909c',
    cursor: 'pointer', fontFamily: 'inherit',
    borderRadius: 0,
  },
  toggleBtnActive: {
    background: '#1a237e', color: '#fff',
    border: '1px solid #1a237e',
    fontWeight: 600,
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0',
    borderBottom: '1px solid #f0f4f7',
  },
  rowCol: {
    display: 'flex', flexDirection: 'column',
    borderBottom: '1px solid #f0f4f7',
    paddingBottom: 2,
  },
  lbl:  { color: '#78909c', flexShrink: 0, marginRight: 8 },
  val:  { color: '#263238', fontFamily: 'monospace' },
  nd:   { color: '#bdbdbd', fontStyle: 'italic' },
  unit: { color: '#90a4ae', fontSize: 10 },
  numInput: {
    width: 72, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 12, fontFamily: 'monospace',
    textAlign: 'right', outline: 'none',
    color: '#263238',
  },
  numInputReadOnly: {
    background: '#f5f7fa', color: '#546e7a', cursor: 'default',
  },
  textInput: {
    width: 140, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 11, fontFamily: 'inherit',
    outline: 'none', color: '#263238',
  },
  select: {
    fontSize: 11, padding: '2px 4px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    color: '#263238', background: '#fff',
    maxWidth: 185,
  },
  arcgisBadge: {
    fontSize: 9, color: '#1565c0', background: '#e3f2fd',
    border: '1px solid #bbdefb', borderRadius: 8,
    padding: '1px 5px', fontWeight: 600,
  },
  dotacionNota: {
    fontSize: 10, color: '#546e7a', fontStyle: 'italic',
    paddingBottom: 3, paddingTop: 1,
  },
  note: {
    margin: 12, padding: '8px 12px',
    background: '#fffde7', border: '1px solid #fff59d', borderRadius: 6,
    fontSize: 12, color: '#827717',
  },
  infoBox: {
    marginTop: 4, fontSize: 11, color: '#1565c0',
    background: '#e3f2fd', border: '1px solid #bbdefb',
    borderRadius: 4, padding: '4px 8px',
  },
}
