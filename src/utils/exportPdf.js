import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * src/utils/exportPdf.js
 *
 * Genera y descarga el "Plan de Nutrientes de una Parcela" en PDF,
 * siguiendo el estilo del informe oficial Sativum (ITACyL).
 *
 * Dependencias (import estático — evita problemas de chunk hash en Vercel):
 *   jspdf           — https://github.com/parallax/jsPDF
 *   jspdf-autotable — https://github.com/simonbengtsson/jsPDF-AutoTable
 *
 * Parámetros:
 *   cultivo              — objeto catálogo Sativum ({ name, ... })
 *   cultivoAnterior      — cultivo precedente en la rotación (o null)
 *   cultivoAnteriorParams— { cropYield }
 *   calculo              — { strategy, tillage, cropYield, recogeResiduos, ... }
 *   fecha                — 'YYYY-MM-DD'
 *   recintos             — lista plana de recintos intersectados
 *                          [{ provincia, municipio, poligono, parcela, recinto }, ...]
 *   supTotalHa           — superficie total de la/s geometría/s (ha)
 *   riego                — { fuenteId, fuenteLabel, no3MgL, dotacionM3, pMgL, kMgL }
 *   npk                  — respuesta /algo/ ({ n, p, k } o { recommendations:[...] })
 *   recomendacion        — respuesta /recommendation ([{ unique:[...], observations }])
 *   nRiego / pRiego / kRiego — kg/ha cubiertos por riego (elementos puros)
 *   baseName             — nombre del fichero sin extensión
 */

// ── Constantes de layout (A4 portrait, mm) ───────────────────────────────────

const PW = 210          // page width
const ML = 18           // margin left
const MR = 18           // margin right
const MT = 15           // margin top
const MB = 15           // margin bottom
const CW = PW - ML - MR // content width  (174 mm)

// Colores
const C_TITLE   = [26,  35, 126]   // azul oscuro
const C_LABEL   = [38,  50,  56]   // casi negro
const C_MUTED   = [90, 100, 110]   // gris medio
const C_BORDER  = [200, 210, 220]  // borde claro
const C_TEAL    = [40, 110, 100]   // cabecera tabla fertilizantes
const C_TEAL_LT = [232, 245, 242]  // fondo alternado tabla
const C_NPK_BG  = [240, 243, 250]  // fondo círculos NPK
const C_NPK_BD  = [180, 190, 215]  // borde círculos NPK
const C_RIEGO   = [225, 245, 254]  // fondo fila riego
const C_WARN_BG = [255, 249, 196]  // fondo aviso
const C_WARN_BD = [255, 213,  79]  // borde aviso

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v, dec = 1) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toFixed(dec).replace('.', ',')
}

function fmtNum(v, dec = 0) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toLocaleString('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

/** Formatea ref SIGPAC como PP-MM-AA-ZZ-PPP-PPP-R */
function fmtRef(r) {
  const pad = (v, n) => String(v ?? 0).padStart(n, '0')
  return [
    pad(r.provincia, 2),
    pad(r.municipio, 2),
    pad(r.agregado ?? 0, 1),
    pad(r.zona ?? 0, 1),
    pad(r.poligono, 3),
    pad(r.parcela, 3),
    pad(r.recinto, 1),
  ].join('-')
}

/** Extrae n/p/k del objeto /algo/ (top-level o último item de recommendations) */
function extraerNPK(npkData) {
  if (!npkData) return { n: 0, p: 0, k: 0 }
  const last = npkData.recommendations?.at(-1)
  return {
    n: npkData.n ?? last?.n ?? 0,
    p: npkData.p ?? last?.p ?? 0,
    k: npkData.k ?? last?.k ?? 0,
  }
}

const P_TO_P2O5 = 2.2914
const K_TO_K2O  = 1.2046

/**
 * N/P2O5/K2O efectivos (fracción mineralizable este ciclo).
 * Para no-orgánicos: efN === bruto, esOrganico === false.
 */
function calcNpkEfectivoPdf(item, fechaInicioCiclo) {
  const dose    = Number(item.cantidad) || 0
  const brutoN    = (item.n    ?? 0) * dose / 100
  const brutoP2o5 = (item.p2o5 ?? 0) * dose / 100
  const brutoK2o  = (item.k2o  ?? 0) * dose / 100
  if (!item.appliesAnnualEffectiveness || !item.fechaAplicacion || !fechaInicioCiclo) {
    return { efN: brutoN, efP2o5: brutoP2o5, efK2o: brutoK2o, pct: 100, esOrganico: false }
  }
  const yearInicio = new Date(fechaInicioCiclo + 'T00:00:00').getFullYear()
  const yearAplic  = new Date(item.fechaAplicacion + 'T00:00:00').getFullYear()
  const delta = Math.min(2, Math.max(0, yearInicio - yearAplic))
  const pct   = item[`yearPercent${delta}`] ?? 100
  return {
    efN:    brutoN    * pct / 100,
    efP2o5: brutoP2o5 * pct / 100,
    efK2o:  brutoK2o  * pct / 100,
    pct, esOrganico: true,
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Genera y descarga el PDF del plan de abonado.
 *
 * @param {object} opts
 */
export async function exportarPlanAbonadoPdf({
  cultivo,
  cultivoAnterior      = null,
  cultivoAnteriorParams = null,
  calculo,
  fecha,
  fechaInicioCiclo     = null,
  fechaFinCiclo        = null,
  recintos             = [],   // lista plana de todos los recintos intersectados
  supTotalHa           = null, // superficie total ha (suma parcelas)
  riego,
  npk,
  recomendacion        = null,
  nRiego               = 0,
  pRiego               = 0,
  kRiego               = 0,
  asesor               = null,
  analisisPropio       = false,
  refAnalisisSuelo     = '',
  fertilizadoresManuales = [],  // alias legacy
  planItems            = null,  // nuevo: array unificado con origen:'sativum'|'manual'
  baseName             = 'fertipro_plan_nutrientes',
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Logo FertiPRO (intenta cargar favicon.png) ────────────────────────────
  let logoDataUrl = null
  try {
    const res = await fetch('/fertipro.png')
    if (res.ok) {
      const blob = await res.blob()
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    }
  } catch {
    // Sin logo — se muestra solo texto
  }

  // ── Fecha formateada ──────────────────────────────────────────────────────
  const fechaFmt = fecha
    ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : new Date().toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      })

  // ── NPK values ────────────────────────────────────────────────────────────
  const { n, p, k }  = extraerNPK(npk)
  const nBruto       = (n ?? 0) + (nRiego ?? 0)
  const p2o5         = p * P_TO_P2O5
  const k2o          = k * K_TO_K2O
  const nRiegoPct    = nRiego > 0    ? nRiego : null
  const p2o5Riego    = pRiego > 0    ? pRiego * P_TO_P2O5 : null
  const k2oRiego     = kRiego > 0    ? kRiego * K_TO_K2O  : null
  const tieneRiego   = riego?.sistemaExplotacion === 'regadio' && (nRiegoPct || p2o5Riego || k2oRiego)

  // ── Superficie total ──────────────────────────────────────────────────────
  const sup = supTotalHa != null && !isNaN(supTotalHa) && supTotalHa > 0
    ? supTotalHa
    : null

  // ── Rendimiento del cultivo actual ────────────────────────────────────────
  const rendimiento = calculo?.cropYield ?? cultivo?.yieldMedium ?? null

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  let y = MT  // cursor Y

  // ── 1. CABECERA ───────────────────────────────────────────────────────────
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', ML, y, 12, 12)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text('FertiPRO', ML + 15, y + 8)
  } else {
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text('FertiPRO', ML, y + 8)
  }

  // Subtítulo derecha
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C_MUTED)
  doc.text('Plan de Nutrientes', PW - MR, y + 5, { align: 'right' })
  doc.text('Motor: FertiliCalc (Villalobos et al. 2020) · CC BY 4.0 ITACyL', PW - MR, y + 9, { align: 'right' })
  doc.text('Suelo: (c)Junta de Castilla y Leon · suelos.itacyl.es', PW - MR, y + 13, { align: 'right' })

  y += 16

  // Línea separadora
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, y, PW - MR, y)
  y += 6

  // ── 2. TÍTULO ─────────────────────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C_LABEL)
  doc.text('PLAN DE NUTRIENTES DE UNA PARCELA', PW / 2, y, { align: 'center' })
  y += 10

  // ── 3. METADATOS ──────────────────────────────────────────────────────────
  const metaLineHeight = 6.5

  function metaRow(label, value) {
    if (!value) return
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    const labelW = doc.getTextWidth(label + ': ')
    doc.text(label + ': ', ML, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), ML + labelW, y)
    y += metaLineHeight
  }

  // Cultivo actual: nombre + rendimiento + régimen hídrico
  const regimenHidrico = riego?.sistemaExplotacion === 'regadio' ? 'Regadío' : 'Secano'
  const cultivoActualStr = rendimiento
    ? `${cultivo?.name ?? '—'} — ${fmtNum(rendimiento, 0)} kg/ha en ${regimenHidrico}`
    : (cultivo?.name ?? '—')
  metaRow('Cultivo actual', cultivoActualStr)

  // Cultivo anterior
  if (cultivoAnterior) {
    const rendAnterior = cultivoAnteriorParams?.cropYield ?? cultivoAnterior?.yieldMedium
    const antStr = rendAnterior
      ? `${cultivoAnterior.name} — Producción: ${fmtNum(rendAnterior, 0)} kg/ha en ${regimenHidrico}`
      : cultivoAnterior.name
    metaRow('Cultivo anterior', antStr)
  }

  // Refs SIGPAC
  metaRow('Fecha del plan de nutrientes', fechaFmt)
  if (fechaInicioCiclo) {
    const fmtInicio = new Date(fechaInicioCiclo + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    metaRow('Inicio de ciclo', fmtInicio)
  }
  if (fechaFinCiclo) {
    const fmtFin = new Date(fechaFinCiclo + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    metaRow('Fin de ciclo', fmtFin)
  }

  // Asesor responsable del plan
  if (asesor?.nombre || asesor?.regfer) {
    const nombreCompleto = [asesor.nombre, asesor.apellidos].filter(Boolean).join(' ')
    const regferStr = asesor.regfer ? `  |  REGFER: ${asesor.regfer}` : ''
    metaRow('Asesor responsable del plan', nombreCompleto + regferStr)
    if (asesor.nif) metaRow('NIF asesor', asesor.nif)
  }

  // Análisis de suelo personalizado
  if (analisisPropio && refAnalisisSuelo) {
    metaRow('Analisis de suelo (laboratorio)', refAnalisisSuelo)
  }

  // Referencia análisis agua
  if (riego?.refAnalisisAgua) {
    metaRow('Analisis agua de riego', riego.refAnalisisAgua)
  }

  y += 4

  // ── 4. TABLA RECINTOS SIGPAC ──────────────────────────────────────────────
  // Se dibuja solo si hay recintos. Sustituye la lista lineal de refs SIGPAC.
  if (recintos.length > 0) {
    const C_ZVN_BG  = [255, 235, 238]  // fondo fila ZVN
    const C_ZVN_TXT = [183,  28,  28]  // texto ZVN

    const recHead = [['Referencia SIGPAC', 'Sup. (ha)', '%', 'Uso', 'Coef. reg.', 'ZVN']]
    const recBody = recintos.map(r => {
      const pad = (v, n) => String(v ?? 0).padStart(n, '0')
      const ref = [
        pad(r.provincia, 2), pad(r.municipio, 2),
        pad(r.agregado ?? 0, 1), pad(r.zona ?? 0, 1),
        pad(r.poligono, 3), pad(r.parcela, 3), pad(r.recinto, 1),
      ].join('-')
      const supHa  = r.superficie_interseccion_ha ?? r.superficie_total_ha
      const pct    = r.pct_ocupado
      const uso    = r.uso_sigpac ?? '—'
      const coef   = r.coef_regadio != null ? `${Number(r.coef_regadio).toFixed(0)} %` : '—'
      const zvn    = r.enZvn === true ? 'SI' : (r.enZvn === false ? 'NO' : '—')
      return [
        ref,
        supHa != null ? fmt(supHa, 4) : '—',
        pct   != null ? `${fmt(pct, 1)} %` : '—',
        uso,
        coef,
        zvn,
      ]
    })

    autoTable(doc, {
      startY: y,
      head:   recHead,
      body:   recBody,
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    7.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2.5, right: 2.5 },
        lineColor:   C_BORDER,
        lineWidth:   0.2,
        font:        'helvetica',
        textColor:   C_LABEL,
        valign:      'middle',
      },
      headStyles: {
        fillColor: [38, 50, 56],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize:  7.5,
        halign:    'center',
      },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: 'bold', font: 'courier', fontSize: 7 },
        1: { cellWidth: 22, halign: 'right' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 5) {
          const raw = recintos[data.row.index]
          if (raw?.enZvn === true) {
            data.cell.styles.fillColor  = C_ZVN_BG
            data.cell.styles.textColor  = C_ZVN_TXT
          }
        }
      },
    })

    y = doc.lastAutoTable.finalY + 6
  }

  // ── 5. RECUADRO NPK ───────────────────────────────────────────────────────
  const boxX  = ML
  const boxW  = CW
  const BADGE_R   = 7.5   // radio del círculo en mm
  const BADGE_SEP = 11    // separación entre centros de círculos
  const N_BADGES  = 5
  const totalBadgesW = (N_BADGES - 1) * BADGE_SEP + 2 * BADGE_R
  const badgeStartX = boxX + (boxW - totalBadgesW) / 2 + BADGE_R

  // Altura del recuadro: cabecera + objetivo/coste + círculos + margen
  const boxPadTop    = 5
  const lineHeaderH  = 10  // altura texto cabecera
  const objetivoH    = 8
  const badgeH       = BADGE_R * 2 + 10  // círculos + valores debajo
  const boxH         = boxPadTop + lineHeaderH + objetivoH + badgeH + 6
  const boxY         = y

  // Marco
  doc.setDrawColor(...C_BORDER)
  doc.setFillColor(248, 250, 253)
  doc.setLineWidth(0.4)
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD')

  let by = boxY + boxPadTop

  // Texto cabecera del recuadro
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C_LABEL)
  const headerTxt = 'Necesidades nutricionales calculadas con FertiPRO para el cultivo actual según rotación y manejo del mismo:'
  const headerLines = doc.splitTextToSize(headerTxt, boxW - 8)
  doc.text(headerLines, boxX + 4, by)
  by += headerLines.length * 4.5 + 2

  // Objetivo de producción
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C_MUTED)
  doc.text('Objetivo de producción', boxX + 4, by)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C_LABEL)
  doc.text(
    rendimiento ? `${fmtNum(rendimiento, 0)} kg/ha` : '—',
    boxX + 50, by
  )
  if (sup != null) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_MUTED)
    doc.text(`Superficie: ${fmt(sup, 2)} ha`, boxX + boxW - 4, by, { align: 'right' })
  }
  by += 8

  // Círculos NPK
  const badges = [
    { label: 'N',     value: fmt(nBruto, 1) },
    { label: 'P2O5', value: fmt(p2o5, 1) },
    { label: 'P',     value: fmt(p, 1) },
    { label: 'K2O',  value: fmt(k2o, 1) },
    { label: 'K',     value: fmt(k, 1) },
  ]

  badges.forEach((badge, i) => {
    const cx = badgeStartX + i * BADGE_SEP
    const cy = by + BADGE_R

    // Círculo relleno
    doc.setFillColor(...C_NPK_BG)
    doc.setDrawColor(...C_NPK_BD)
    doc.setLineWidth(0.35)
    doc.circle(cx, cy, BADGE_R, 'FD')

    // Label (símbolo elemento)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text(badge.label, cx, cy - 1.5, { align: 'center' })

    // Valor
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_LABEL)
    doc.text(badge.value, cx, cy + 3.5, { align: 'center' })

    // Unidad
    doc.setFontSize(6)
    doc.setTextColor(...C_MUTED)
    doc.text('kg/ha', cx, cy + 6.5, { align: 'center' })
  })

  by += BADGE_R * 2 + 4

  y = boxY + boxH + 6

  // ── 6. APORTE DEL AGUA DE RIEGO ──────────────────────────────────────────
  const tieneAguaRiego = riego?.sistemaExplotacion === 'regadio' && Number(riego?.dotacionM3) > 0
  if (tieneAguaRiego) {
    const dotHa    = Number(riego.dotacionM3)
    const dotTotal = sup != null ? dotHa * sup : null

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 100, 140)
    doc.text('APORTE DEL AGUA DE RIEGO', ML, y)
    y += 5

    autoTable(doc, {
      startY: y,
      head: [['ORIGEN DEL AGUA', 'DOTACION/HA', 'DOTACION TOTAL', 'UF N (kg/ha)', 'UF P2O5 (kg/ha)', 'UF K2O (kg/ha)']],
      body: [[
        (riego.fuenteLabel ?? 'OTROS ORIGENES').toUpperCase(),
        `${fmtNum(dotHa, 0)} m³/ha`,
        dotTotal != null ? `${fmtNum(dotTotal, 0)} m³` : '—',
        nRiegoPct  != null ? fmt(nRiegoPct, 1)  : '—',
        p2o5Riego  != null ? fmt(p2o5Riego, 1)  : '—',
        k2oRiego   != null ? fmt(k2oRiego, 1)   : '—',
      ]],
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    8.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        lineColor:   C_BORDER, lineWidth: 0.2,
        font:        'helvetica', textColor: C_LABEL, valign: 'middle',
        fillColor:   C_RIEGO, fontStyle: 'bold',
      },
      headStyles: {
        fillColor: [40, 100, 140],
        textColor: [255, 255, 255],
        fontStyle: 'bold', fontSize: 8.5, halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 58, halign: 'left'  },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 19, halign: 'right' },
        4: { cellWidth: 19, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── 7. PLAN DE APLICACIONES ──────────────────────────────────────────────
  const allPlanItems = planItems ?? fertilizadoresManuales ?? []
  if (Array.isArray(allPlanItems) && allPlanItems.length > 0) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text('PLAN DE APLICACIONES', ML, y)
    y += 5

    const itemsSorted = [...allPlanItems].sort((a, b) => {
      if (!a.fechaAplicacion && !b.fechaAplicacion) return 0
      if (!a.fechaAplicacion) return 1
      if (!b.fechaAplicacion) return -1
      return a.fechaAplicacion.localeCompare(b.fechaAplicacion)
    })

    const planHead = [[
      'Fecha', 'Origen', 'Producto / Fertilizante', 'Tipo SIEX',
      'Dosis\n(kg/ha)', 'N\n(kg/ha)', 'P2O5\n(kg/ha)', 'K2O\n(kg/ha)',
      'N acum.\n(kg/ha)', 'P2O5\nacum.\n(kg/ha)', 'K2O\nacum.\n(kg/ha)',
    ]]

    let sumN = 0; let sumP2o5 = 0; let sumK2o = 0
    let hayOrganicos = false
    const planBody = itemsSorted.map(item => {
      const dose  = Number(item.cantidad) || 0
      const ef    = calcNpkEfectivoPdf(item, fechaInicioCiclo)
      if (ef.esOrganico) hayOrganicos = true
      sumN    += ef.efN
      sumP2o5 += ef.efP2o5
      sumK2o  += ef.efK2o
      const fechaStr = item.fechaAplicacion
        ? new Date(item.fechaAplicacion + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—'
      const origenStr = item.origen === 'sativum' ? 'Sativum' : 'Asesor'
      // Para orgánicos con mineralización parcial: añadir "(X%)" al valor N
      const nStr    = ef.esOrganico && ef.pct !== 100 ? `${fmt(ef.efN, 1)}*` : fmt(ef.efN, 1)
      const p2o5Str = ef.esOrganico && ef.pct !== 100 ? `${fmt(ef.efP2o5, 1)}*` : fmt(ef.efP2o5, 1)
      const k2oStr  = ef.esOrganico && ef.pct !== 100 ? `${fmt(ef.efK2o, 1)}*` : fmt(ef.efK2o, 1)
      return [
        fechaStr,
        origenStr,
        item.nombre ?? '—',
        item.tipoSIEX ?? '—',
        fmt(dose, 0),
        nStr,
        p2o5Str,
        k2oStr,
        fmt(sumN,    1),
        fmt(sumP2o5, 1),
        fmt(sumK2o,  1),
      ]
    })

    // Fila TOTAL
    planBody.push([
      { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [232, 245, 242], textColor: C_TEAL } },
      { content: fmt(sumN,    1), styles: { fontStyle: 'bold', fillColor: [232, 245, 242], textColor: C_TEAL } },
      { content: fmt(sumP2o5, 1), styles: { fontStyle: 'bold', fillColor: [232, 245, 242], textColor: C_TEAL } },
      { content: fmt(sumK2o,  1), styles: { fontStyle: 'bold', fillColor: [232, 245, 242], textColor: C_TEAL } },
      { content: '', styles: { fillColor: [232, 245, 242] } },
      { content: '', styles: { fillColor: [232, 245, 242] } },
      { content: '', styles: { fillColor: [232, 245, 242] } },
    ])

    // Fila cobertura
    if (nBruto > 0 || p2o5 > 0 || k2o > 0) {
      const covN = nBruto > 0 ? Math.round((sumN    / nBruto) * 100) : null
      const covP = p2o5   > 0 ? Math.round((sumP2o5 / p2o5)   * 100) : null
      const covK = k2o    > 0 ? Math.round((sumK2o  / k2o)    * 100) : null
      planBody.push([{
        content: `Cobertura s/ necesidad bruta: N ${covN != null ? covN + '%' : '—'} · P2O5 ${covP != null ? covP + '%' : '—'} · K2O ${covK != null ? covK + '%' : '—'}`,
        colSpan: 11,
        styles: { fontStyle: 'italic', fontSize: 7.5, fillColor: C_WARN_BG, textColor: [120, 90, 0] },
      }])
    }

    // Nota orgánicos (solo si hay al menos uno con mineralización parcial)
    if (hayOrganicos) {
      planBody.push([{
        content: '* Fertilizante organico con mineralizacion anual: N/P2O5/K2O indicado = fraccion efectiva este ciclo (yearPercent Sativum)',
        colSpan: 11,
        styles: { fontStyle: 'italic', fontSize: 6.5, fillColor: [232, 245, 242], textColor: [40, 100, 60] },
      }])
    }

    autoTable(doc, {
      startY:     y,
      head:       planHead,
      body:       planBody,
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    7,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        lineColor:   C_BORDER, lineWidth: 0.2,
        font:        'helvetica', textColor: C_LABEL, valign: 'middle',
      },
      headStyles: {
        fillColor: C_TITLE, textColor: [255, 255, 255],
        fontStyle: 'bold', fontSize: 7, halign: 'center',
      },
      columnStyles: {
        0:  { cellWidth: 12, halign: 'center' },
        1:  { cellWidth: 14, halign: 'center' },
        2:  { cellWidth: 42, halign: 'left'   },
        3:  { cellWidth: 20, halign: 'center' },
        4:  { cellWidth: 12, halign: 'right'  },
        5:  { cellWidth: 12, halign: 'right'  },
        6:  { cellWidth: 14, halign: 'right'  },
        7:  { cellWidth: 12, halign: 'right'  },
        8:  { cellWidth: 13, halign: 'right', fontStyle: 'bold' },
        9:  { cellWidth: 13, halign: 'right', fontStyle: 'bold' },
        10: { cellWidth: 10, halign: 'right', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [250, 252, 255] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 1) {
          const txt = data.cell.text[0]
          if (txt === 'Sativum') {
            data.cell.styles.fillColor = [187, 222, 251]
            data.cell.styles.textColor = [13, 71, 161]
          } else if (txt === 'Asesor') {
            data.cell.styles.fillColor = [200, 230, 201]
            data.cell.styles.textColor = [27, 94, 32]
          }
        }
      },
    })
  }

  // ── 8. PIE DE PÁGINA (paginación X/N) ─────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Línea separadora
    const footerY = doc.internal.pageSize.getHeight() - MB + 2
    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.3)
    doc.line(ML, footerY, PW - MR, footerY)

    // Página X/N (centro)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_MUTED)
    doc.text(`Página ${i}/${totalPages}`, PW / 2, footerY + 5, { align: 'center' })

    // FertiPRO (izquierda)
    doc.text('FertiPRO', ML, footerY + 5)

    // Fecha generación (derecha)
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-ES')}`,
      PW - MR, footerY + 5, { align: 'right' }
    )
  }

  // ── 8. DESCARGA ───────────────────────────────────────────────────────────
  doc.save(`${baseName}.pdf`)
}
