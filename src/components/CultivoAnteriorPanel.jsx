/**
 * src/components/CultivoAnteriorPanel.jsx
 *
 * Panel "Campaña anterior" — cultivo precedente en la rotación.
 *
 * Si se rellena, el cultivo anterior se incluye como primer elemento del
 * array `rotation` en el payload de /fertilicalc/algo/, lo que permite al
 * motor tener en cuenta la mineralización de residuos del año previo.
 *
 * Props:
 *   cultivo          — objeto cultivo anterior | null
 *   params           — { cropYield, laboreo, recogeResiduos, quemaResiduos, fRes }
 *   onCultivoChange  — (cultivo | null) => void
 *   onParamsChange   — (params) => void
 */
import { useState } from 'react'
import CultivoSelector from '../cultivos/CultivoSelector'

function esCereal(c) {
  return c?.plantSpeciesGroup?.toUpperCase() === 'CEREALS'
}

/**
 * Calcula el f_res automático (B7) según cultivo y si se recoge la paja.
 * Igual que la lógica de cultivoToCropFeatures en sativum-algo.js.
 */
function computeAutoFRes(cultivo, recogeResiduos) {
  if (!cultivo) return null
  if (
    cultivo.plantSpeciesGroup?.toUpperCase() === 'CEREALS' &&
    cultivo.fres === 10 &&
    !recogeResiduos
  ) return 100
  return cultivo.fres ?? 100
}

export default function CultivoAnteriorPanel({ cultivo, params, onCultivoChange, onParamsChange }) {
  const [open, setOpen] = useState(false)

  const set = patch => onParamsChange({ ...params, ...patch })

  const mostrarResiduos = cultivo != null
  const esCerealCultivo = esCereal(cultivo)
  const labelResiduos   = esCerealCultivo ? '¿Se recoge la paja?' : 'Recoge residuos del campo'
  const autoFRes        = computeAutoFRes(cultivo, params.recogeResiduos)

  return (
    <div style={SC.card}>

      {/* ── Cabecera colapsable ──────────────────────────────────────────── */}
      <button onClick={() => setOpen(v => !v)} style={SC.header}>
        <span style={SC.title}>🌾 Campaña anterior</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {cultivo && !open && (
        <div style={SC.preview}>
          {cultivo.name} · {params.cropYield ?? cultivo.yieldMedium ?? '—'} kg/ha
        </div>
      )}

      {open && (
        <div style={{ paddingTop: 6 }}>

          {/* Selector cultivo anterior — mismo combobox que cultivo actual */}
          <div style={SC.fieldGroup}>
            <CultivoSelector
              value={cultivo?.name ?? null}
              onChange={onCultivoChange}
              label="Cultivo precedente"
            />
          </div>

          {cultivo && (
            <>
              {/* Producción */}
              <div style={SC.row}>
                <span style={SC.rowLbl}>Producción</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    value={params.cropYield ?? ''}
                    placeholder={String(cultivo.yieldMedium ?? 0)}
                    min={0}
                    step={100}
                    onChange={e => set({ cropYield: e.target.value === '' ? null : Number(e.target.value) })}
                    style={SC.numInput}
                  />
                  <span style={SC.unit}>kg/ha</span>
                </span>
              </div>

              {/* Laboreo tras cosecha */}
              <label style={SC.checkRow}>
                <input
                  type="checkbox"
                  checked={params.laboreo}
                  onChange={e => set({ laboreo: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                <span>Laboreo tras cosecha</span>
              </label>

              {/* Residuos (todos los cultivos) */}
              {mostrarResiduos && (
                <>
                  <label style={SC.checkRow}>
                    <input
                      type="checkbox"
                      checked={params.recogeResiduos}
                      onChange={e => set({ recogeResiduos: e.target.checked, fRes: null })}
                      style={{ marginRight: 6 }}
                    />
                    <span>{labelResiduos}</span>
                  </label>

                  {/* Quema residuos — solo cereales, independiente de recogeResiduos */}
                  {esCerealCultivo && (
                    <label style={SC.checkRow}>
                      <input
                        type="checkbox"
                        checked={params.quemaResiduos}
                        onChange={e => set({ quemaResiduos: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      <span>Quema los residuos</span>
                    </label>
                  )}

                  {/* Residuos en campo (f_res) — editable, auto-relleno por regla B7 */}
                  <div style={SC.row}>
                    <span style={SC.rowLbl}>Residuos en campo</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        value={params.fRes ?? ''}
                        placeholder={autoFRes !== null ? String(autoFRes) : ''}
                        min={0}
                        max={100}
                        step={5}
                        onChange={e => set({ fRes: e.target.value === '' ? null : Number(e.target.value) })}
                        style={SC.numInput}
                      />
                      <span style={SC.unit}>%</span>
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const SC = {
  card: {
    margin: 12, padding: 10,
    background: '#f9fafb', border: '1px solid #e0e6ed', borderRadius: 6,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'inherit',
  },
  title:   { fontSize: 12, fontWeight: 700, color: '#37474f' },
  opcional:{ fontSize: 10, fontWeight: 400, color: '#90a4ae', marginLeft: 4 },
  preview: { fontSize: 11, color: '#546e7a', marginTop: 3, fontStyle: 'italic' },
  fieldGroup: { marginBottom: 6 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0f4f7',
  },
  rowLbl:  { color: '#78909c' },
  unit:    { color: '#90a4ae', fontSize: 10 },
  numInput:{
    width: 80, padding: '2px 5px',
    border: '1px solid #cfd8dc', borderRadius: 3,
    fontSize: 12, fontFamily: 'monospace', textAlign: 'right',
    color: '#263238',
  },
  checkRow:{
    display: 'flex', alignItems: 'center',
    fontSize: 12, cursor: 'pointer', padding: '3px 0',
  },
  hint:    { fontSize: 11, color: '#90a4ae', fontStyle: 'italic' },
}
