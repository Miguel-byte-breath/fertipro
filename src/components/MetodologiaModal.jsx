/**
 * MetodologiaModal.jsx
 * Modal de metodología y fuentes — abre desde el botón ℹ️ del header.
 * Documenta la cadena FertiliCalc → FaST → SATIVUM (ITACyL) → FertiPRO.
 */
export default function MetodologiaModal({ open, onClose }) {
  if (!open) return null
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <button style={S.close} onClick={onClose} title="Cerrar">✕</button>

        <h2 style={S.h2}>Metodología y fuentes</h2>

        {/* ── Motor de cálculo ─────────────────────────────────────────── */}
        <h3 style={S.h3}>Motor de cálculo</h3>
        <p style={S.p}>
          FertiPRO calcula el balance NPK mediante el{' '}
          <strong>Servicio de balance de nutrientes de Sativum</strong> (ITACyL),
          consumido a través del{' '}
          <a href="https://portal.api.itacyl.es/portal/apis/" target="_blank" rel="noreferrer" style={S.a}>Portal del desarrollador del ITACyL</a>.
        </p>
        <p style={S.p}>
          El cálculo de necesidades y recomendación de Sativum usa el algoritmo FertiliCalc,
          servicio público de balance de nutrientes conforme a la publicación{' '}
          <em>Fitotecnia: principios de agronomía para una agricultura sostenible</em>{' '}
          (Villalobos &amp; Fereres), implementado en la aplicación FertiliCalc
          (F.&nbsp;Villalobos, IAS-CSIC / Universidad de Córdoba) y en la plataforma{' '}
          <strong>Farm Advisory Tool for Nutrients (FaST)</strong> de la Comisión Europea,
          con algunas modificaciones introducidas por el ITACyL.
        </p>

        {/* ── Cadena institucional ─────────────────────────────────────── */}
        <h3 style={S.h3}>Cadena institucional</h3>
        <ul style={S.ul}>
          <li style={S.li}>
            <strong>FaST Stage 1</strong> (Comisión Europea, 2020–2021) — plataforma digital
            de sostenibilidad agrícola (DG AGRI · DG DEFIS · ISA²); FertiliCalc fue el
            algoritmo de fertilización adoptado para España, con Castilla y León como una de
            las cuatro regiones piloto europeas.
          </li>
          <li style={S.li}>
            <strong>SATIVUM</strong> (ITACyL) — despliegue operativo surgido del piloto FaST;
            expone FertiliCalc como API REST pública para agricultores y asesores. FertiPRO se
            conecta directamente a estas APIs.
          </li>
          <li style={S.li}>
            <strong>Convenio FEGA–ITACyL</strong>{' '}
            (<a
              href="https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-22205"
              target="_blank" rel="noreferrer" style={S.a}
            >BOE-A-2023-22205</a>, octubre 2023) — encomienda de gestión para mejorar la
            información de suelos a nivel nacional y poner a disposición APIs de recomendación
            de fertilización para uso público.
          </li>
        </ul>

        {/* ── Datos de suelo ───────────────────────────────────────────── */}
        <h3 style={S.h3}>Datos de suelo</h3>
        <p style={S.p}>
          Capas ArcGIS del{' '}
          <a href="https://suelos.itacyl.es" target="_blank" rel="noreferrer" style={S.a}>
            Portal de Suelos de Castilla y León — ITACyL
          </a>: textura, materia orgánica, pH, P Olsen, K, NO₃.{' '}
          ©Junta de Castilla y León, licencia IGCYL-NC.
        </p>

        {/* ── APIs y documentación ─────────────────────────────────────── */}
        <h3 style={S.h3}>APIs y documentación</h3>
        <ul style={S.ul}>
          <li style={S.li}>
            <a
              href="https://portal.api.itacyl.es/portal/apis/"
              target="_blank" rel="noreferrer" style={S.a}
            >Portal del desarrollador ITACyL</a>{' '}
            — catálogo de APIs (nutrientes, fertilizantes, cultivos)
          </li>
          <li style={S.li}>
            <a
              href="https://servicios.itacyl.es/resources/public/sativum/ServiciosBalanceNutrientes.docx"
              target="_blank" rel="noreferrer" style={S.a}
            >Guía de servicios SATIVUM v2.1.0</a>{' '}
            — documentación oficial del balance de nutrientes
          </li>
        </ul>

        {/* ── Referencia ───────────────────────────────────────────────── */}
        <h3 style={S.h3}>Referencia</h3>
        <p style={S.ref}>
          Villalobos, F. J., Delgado, A., López-Bernal, Á. &amp; Quemada, M. (2020).
          FertiliCalc: A Decision Support System for Fertilizer Management.{' '}
          <em>International Journal of Plant Production</em>, 14, 299–308.{' '}
          <a
            href="https://doi.org/10.1007/s42106-019-00085-1"
            target="_blank" rel="noreferrer" style={S.a}
          >https://doi.org/10.1007/s42106-019-00085-1</a>
        </p>
      </div>
    </div>
  )
}

const GREEN = '#2e7d32'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9000,
  },
  modal: {
    background: '#fff', borderRadius: 10, padding: '28px 32px',
    maxWidth: 640, width: '90%', maxHeight: '80vh', overflowY: 'auto',
    position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
  },
  close: {
    position: 'absolute', top: 14, right: 16,
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#888', lineHeight: 1, padding: 2,
  },
  h2: { margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: GREEN },
  h3: {
    margin: '20px 0 6px', fontSize: 11, fontWeight: 700,
    color: '#777', textTransform: 'uppercase', letterSpacing: 0.6,
  },
  p:   { margin: '0 0 8px', fontSize: 13, lineHeight: 1.65, color: '#333' },
  ul:  { margin: '0 0 4px', paddingLeft: 20 },
  li:  { fontSize: 13, lineHeight: 1.65, color: '#333', marginBottom: 6 },
  ref: { margin: 0, fontSize: 12, lineHeight: 1.65, color: '#555' },
  a:   { color: GREEN },
}
