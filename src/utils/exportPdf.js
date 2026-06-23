import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { MEDIDAS_MITIGACION_GEI, GRUPOS_GEI } from '../data/sativum/medidasMitigacionGEI'

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

// Logo FertiPRO — PNG 120×120 incrustado (generado desde public/fertipro.png)
const FERTIPRO_LOGO_B64 = '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'

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
  suelo                = null,
  cec                  = null,
  analisisPropio       = false,
  refAnalisisSuelo     = '',
  fertilizadoresManuales = [],  // alias legacy
  planItems            = null,  // nuevo: array unificado con origen:'sativum'|'manual'
  medidasGEI           = [],   // códigos SIEX seleccionados (Anexo V RD 1051/2022)
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
  doc.text('Motor: FertiliCalc (Villalobos et al. 2020) · Sativum · CC BY 4.0 ITACyL', PW - MR, y + 9, { align: 'right' })
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
  doc.text('PLAN DE ABONADO | BALANCE DE NUTRIENTES', PW / 2, y, { align: 'center' })
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
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    doc.text('Identificación de todos los recintos', ML, y)
    y += 5
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
  const BADGE_R    = 9.5  // radio en mm (era 7.5 → +27%)
  const BADGE_SEP  = 14   // separación entre centros (era 11)
  const N_BADGES   = 5
  const totalBadgesW = (N_BADGES - 1) * BADGE_SEP + 2 * BADGE_R
  const badgeStartX  = boxX + (boxW - totalBadgesW) / 2 + BADGE_R

  // Dimensiones del recuadro
  const BOX_HEADER_H = 9  // banda azul de cabecera
  // boxH = header + padding + subtítulo + objetivo + estrategia + gap + círculos(diámetro) + pad inferior
  const boxH = BOX_HEADER_H + 5 + 6 + 8 + 7 + 6 + BADGE_R * 2 + 6

  // Etiqueta legible de la estrategia de cálculo
  const ESTRATEGIA_LABEL = {
    SUFFICIENCY: 'Estrategia de suficiencia (minimo fertilizante)',
    REDUCED:     'Acumulacion y mantenimiento (abono reducido)',
    MAINTENANCE: 'Mantenimiento (analisis de suelo no disponible)',
    MAXIMUM:     'Acumulacion y mantenimiento (maximo rendimiento)',
  }
  const estrategiaLabel = ESTRATEGIA_LABEL[calculo?.strategy] ?? calculo?.strategy ?? '—'
  const boxY = y

  // Fondo claro del recuadro
  doc.setFillColor(245, 248, 255)
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'F')

  // Banda de cabecera azul oscuro (esquinas superiores redondeadas, inferiores cuadradas)
  doc.setFillColor(...C_TITLE)
  doc.roundedRect(boxX, boxY, boxW, BOX_HEADER_H + 3, 3, 3, 'F')
  doc.rect(boxX, boxY + BOX_HEADER_H / 2, boxW, BOX_HEADER_H / 2 + 3, 'F')

  // Borde exterior (solo trazo, sin relleno)
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.5)
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'S')

  // Título blanco centrado sobre la banda azul
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('NECESIDADES NUTRICIONALES', PW / 2, boxY + BOX_HEADER_H / 2 + 1.5, { align: 'center' })

  let by = boxY + BOX_HEADER_H + 8

  // Subtítulo centrado
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C_MUTED)
  doc.text(
    'Cálculo realizado con la API Sativum (ITACyL) según rotación y manejo del mismo.',
    PW / 2, by, { align: 'center' }
  )
  by += 7

  // Objetivo de producción + superficie
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C_MUTED)
  doc.text('Objetivo de produccion', boxX + 6, by)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C_LABEL)
  doc.text(
    rendimiento ? `${fmtNum(rendimiento, 0)} kg/ha` : '—',
    boxX + 57, by
  )
  if (sup != null) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_MUTED)
    doc.text(`Superficie: ${fmt(sup, 2)} ha`, boxX + boxW - 6, by, { align: 'right' })
  }
  by += 8  // fila objetivo

  // Estrategia de cálculo
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C_MUTED)
  doc.text('Estrategia', boxX + 6, by)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C_LABEL)
  doc.text(estrategiaLabel, boxX + 57, by)
  by += 7 + 6  // fila estrategia + gap antes de círculos

  // Círculos NPK — blancos con borde azul oscuro, más grandes
  const badges = [
    { label: 'N',    value: fmt(nBruto, 1) },
    { label: 'P2O5', value: fmt(p2o5,  1) },
    { label: 'P',    value: fmt(p,     1) },
    { label: 'K2O',  value: fmt(k2o,   1) },
    { label: 'K',    value: fmt(k,     1) },
  ]

  badges.forEach((badge, i) => {
    const cx = badgeStartX + i * BADGE_SEP
    const cy = by + BADGE_R

    // Círculo blanco con borde azul oscuro
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...C_TITLE)
    doc.setLineWidth(0.6)
    doc.circle(cx, cy, BADGE_R, 'FD')

    // Símbolo del elemento (parte superior del círculo)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text(badge.label, cx, cy - 2.5, { align: 'center' })

    // Valor numérico
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    doc.text(badge.value, cx, cy + 3.5, { align: 'center' })

    // Unidad (parte inferior del círculo)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_MUTED)
    doc.text('kg/ha', cx, cy + 7.5, { align: 'center' })
  })

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

    const C_TITLE_LT = [40, 60, 160]  // azul más claro para sub-filas
    const planHead = [[
      { content: 'Fecha',                   rowSpan: 2, styles: { valign: 'middle' } },
      { content: 'Origen',                  rowSpan: 2, styles: { valign: 'middle' } },
      { content: 'Producto / Fertilizante', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
      { content: 'Tipo SIEX',               rowSpan: 2, styles: { valign: 'middle' } },
      { content: 'Dosis\nkg/ha',             rowSpan: 2, styles: { valign: 'middle', halign: 'right' } },
      { content: 'UF (kg/ha)',  colSpan: 3,  styles: { halign: 'center', valign: 'middle' } },
      { content: 'ACUMULADO',   colSpan: 3,  styles: { halign: 'center', valign: 'middle' } },
    ], [
      { content: 'N',    styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
      { content: 'P2O5', styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
      { content: 'K2O',  styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
      { content: 'N',    styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
      { content: 'P2O5', styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
      { content: 'K2O',  styles: { halign: 'right', fillColor: C_TITLE_LT, textColor: [255, 255, 255] } },
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
        0:  { cellWidth: 16, halign: 'center' },  // Fecha: 12→16 (evita truncación DD/MM/YY)
        1:  { cellWidth: 13, halign: 'center' },  // Origen: 14→13
        2:  { cellWidth: 40, halign: 'left'   },  // Producto: 42→40
        3:  { cellWidth: 18, halign: 'center' },  // Tipo SIEX: 20→18
        4:  { cellWidth: 11, halign: 'right'  },  // Dosis: 12→11
        5:  { cellWidth: 12, halign: 'right'  },  // N
        6:  { cellWidth: 13, halign: 'right'  },  // P2O5: 14→13
        7:  { cellWidth: 11, halign: 'right'  },  // K2O: 12→11
        8:  { cellWidth: 14, halign: 'right', fontStyle: 'bold' },  // N acum: 13→14
        9:  { cellWidth: 13, halign: 'right', fontStyle: 'bold' },  // P2O5 acum
        10: { cellWidth: 13, halign: 'right', fontStyle: 'bold' },  // K2O acum: 10→13
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

  // ── 8. MEDIDAS DE MITIGACIÓN GEI (Anexo V RD 1051/2022) ──────────────────
  const medidasSeleccionadas = Array.isArray(medidasGEI) && medidasGEI.length > 0
    ? MEDIDAS_MITIGACION_GEI.filter(m => medidasGEI.includes(m.codigoSiex))
    : []

  if (medidasSeleccionadas.length > 0) {
    y = doc.lastAutoTable?.finalY ?? y
    y += 6

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text('MEDIDAS DE MITIGACION GEI — Anexo V RD 1051/2022', ML, y)
    y += 5

    // Agrupar por grupo
    const geiBody = []
    GRUPOS_GEI.forEach(grupo => {
      const delGrupo = medidasSeleccionadas.filter(m => m.grupo === grupo)
      if (delGrupo.length === 0) return
      // Fila de cabecera de grupo
      geiBody.push([{
        content: grupo,
        colSpan: 2,
        styles: { fontStyle: 'bold', fillColor: [232, 245, 242], textColor: C_TEAL, fontSize: 7.5 },
      }])
      delGrupo.forEach(m => {
        geiBody.push([
          { content: `SIEX ${m.codigoSiex}`, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: m.texto, styles: { halign: 'left' } },
        ])
      })
    })

    autoTable(doc, {
      startY:     y,
      head:       [[
        { content: 'Cod. SIEX', styles: { halign: 'center' } },
        { content: 'Medida de mitigacion de GEI y amoniaco', styles: { halign: 'left' } },
      ]],
      body:       geiBody,
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    7.5,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        lineColor:   C_BORDER, lineWidth: 0.2,
        font:        'helvetica', textColor: C_LABEL, valign: 'middle',
      },
      headStyles: {
        fillColor: [40, 100, 140],
        textColor: [255, 255, 255],
        fontStyle: 'bold', fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: CW - 20, halign: 'left' },
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── ANEXO: DATOS DE SUELO Y AGUA DE RIEGO ───────────────────────────────────
  if (suelo) {
    doc.addPage()
    let ay = MT

    // Título del anexo
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_TITLE)
    doc.text('DATOS DE SUELO Y AGUA DE RIEGO', PW / 2, ay, { align: 'center' })
    ay += 4
    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.4)
    doc.line(ML, ay, PW - MR, ay)
    ay += 8

    // ── Suelo ──────────────────────────────────────────────────────────────
    const SOIL_LBL = {
      SANDY:      'Arenosa',
      SANDY_LOAM: 'Franco arenosa',
      LOAM:       'Franca',
      SILTY_LOAM: 'Franco limosa',
      CLAY_LOAM:  'Franco arcillosa',
      CLAY:       'Arcillosa',
    }

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    doc.text('ANALISIS DE SUELO', ML, ay)
    ay += 5

    const fuenteSuelo = analisisPropio
      ? (refAnalisisSuelo
          ? `Laboratorio propio  |  Ref. boletin: ${refAnalisisSuelo}`
          : 'Laboratorio propio')
      : 'ArcGIS Sativum (ITACyL) — suelos.itacyl.es'

    const sueloRows = [
      ['Fuente datos suelo', fuenteSuelo],
      ...(suelo.soilTypeUsdaLabel
        ? [['Textura (USDA oficial, capa ArcGIS)', suelo.soilTypeUsdaLabel]]
        : []),
      ['Textura simplificada (Sativum)', SOIL_LBL[suelo.soilType] ?? suelo.soilType ?? '—'],
      ['Materia organica', suelo.organicMatter != null ? `${fmt(suelo.organicMatter, 2)} %` : '—'],
      ['pH', suelo.ph != null ? fmt(suelo.ph, 1) : '—'],
      ['P Olsen', suelo.pOlsen != null ? `${fmt(suelo.pOlsen, 1)} ppm` : '—'],
      ['K suelo', suelo.kSoil != null ? `${fmtNum(suelo.kSoil, 0)} ppm` : '—'],
      ['CEC (capacidad intercambio cationico)', cec != null ? `${fmtNum(cec, 0)} meq/kg` : '—'],
    ]

    autoTable(doc, {
      startY: ay,
      body:   sueloRows,
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    8.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
        lineColor: C_BORDER, lineWidth: 0.2,
        font: 'helvetica', textColor: C_LABEL, valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 82, fontStyle: 'bold', fillColor: [245, 247, 250] },
        1: { cellWidth: CW - 82 },
      },
    })
    ay = doc.lastAutoTable.finalY + 10

    // ── Agua de riego ──────────────────────────────────────────────────────
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    doc.text('AGUA DE RIEGO', ML, ay)
    ay += 5

    const tieneRiegoAnexo = riego?.sistemaExplotacion === 'regadio'
    const aguaRows = [
      ['Sistema de explotacion', tieneRiegoAnexo ? 'Regadio' : 'Secano'],
    ]
    if (tieneRiegoAnexo) {
      aguaRows.push([
        'Origen del agua (SIEX)',
        riego.fuenteLabel ?? (riego.fuenteId > 0 ? `SIEX ${riego.fuenteId}` : 'Sin especificar'),
      ])
      if (riego.refAnalisisAgua)
        aguaRows.push(['Ref. analisis agua', riego.refAnalisisAgua])
      if (Number(riego.dotacionM3) > 0)
        aguaRows.push(['Dotacion riego', `${fmtNum(Number(riego.dotacionM3), 0)} m³/ha`])
      if (Number(riego.no3MgL) > 0)
        aguaRows.push(['NO3 agua de riego', `${fmt(Number(riego.no3MgL), 1)} mg/L`])
      if (Number(riego.pMgL) > 0)
        aguaRows.push(['P agua de riego', `${fmt(Number(riego.pMgL), 1)} mg/L`])
      if (Number(riego.kMgL) > 0)
        aguaRows.push(['K agua de riego', `${fmt(Number(riego.kMgL), 1)} mg/L`])
    }

    autoTable(doc, {
      startY: ay,
      body:   aguaRows,
      margin:     { left: ML, right: MR },
      tableWidth: CW,
      styles: {
        fontSize:    8.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
        lineColor: C_BORDER, lineWidth: 0.2,
        font: 'helvetica', textColor: C_LABEL, valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 82, fontStyle: 'bold', fillColor: [235, 245, 255] },
        1: { cellWidth: CW - 82 },
      },
    })
  }

  // ── 9. PIE DE PÁGINA (paginación X/N) ─────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// exportarPlanRiegoPdf
// Genera y descarga el "Plan de Riego Semanal" en PDF.
//
// Params:
//   cultivo   — objeto Sativum ({ name, ... })
//   fechaIni  — 'YYYY-MM-DD'
//   fechaFin  — 'YYYY-MM-DD'
//   planRiego — respuesta de /api/calcular-riego
//               { ok, redistribucion_termica, programacion_semanal[], balance_mensual[], estacion? }
// ─────────────────────────────────────────────────────────────────────────────
export function exportarPlanRiegoPdf({ cultivo, fechaIni, fechaFin, planRiego }) {
  if (!planRiego?.ok) return

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const { redistribucion_termica, programacion_semanal = [], balance_mensual = [], estacion } = planRiego

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtN  = (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtFecha = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  const totalRiego = programacion_semanal.reduce((s, r) => s + (r.riego_neto_m3ha || 0), 0)

  // ── Layout ───────────────────────────────────────────────────────────────
  let y = MT

  // ── 1. CABECERA ──────────────────────────────────────────────────────────
  // Banda azul oscuro
  doc.setFillColor(...C_TITLE)
  doc.rect(0, 0, PW, 18, 'F')

  // Logo FertiPRO (imagen PNG incrustada)
  doc.addImage(FERTIPRO_LOGO_B64, 'PNG', ML, 2, 14, 14)

  // Título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('FertiPRO', ML + 16, 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('PLAN DE RIEGO SEMANAL', ML + 16, 15)

  // Atribución derecha
  doc.setFontSize(7)
  doc.setTextColor(180, 210, 255)
  doc.text('Datos climaticos: SiAR MAPA (ETo oficial) · Motor: SIG Riego Pro', PW - MR, 11, { align: 'right' })

  y = 24

  // ── 2. METADATOS ─────────────────────────────────────────────────────────
  const meta = [
    ['Cultivo', cultivo?.name || '—'],
    ['Ciclo', `${fmtFecha(fechaIni)} - ${fmtFecha(fechaFin)}`],
    ['Redistribucion termica', redistribucion_termica ? 'Activa' : 'No aplicada'],
    ['Riego total asignado', `${fmtN(totalRiego)} m3/ha`],
    ['Semanas con riego', `${programacion_semanal.filter(r => r.riego_neto_m3ha > 0).length} de ${programacion_semanal.length}`],
  ]
  if (estacion) meta.push(['Estacion SIAR mas proxima', estacion])

  autoTable(doc, {
    startY: y,
    body:   meta,
    margin:     { left: ML, right: MR },
    tableWidth: CW,
    styles: {
      fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
      lineColor: C_BORDER, lineWidth: 0.2, font: 'helvetica',
      textColor: C_LABEL, valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold', fillColor: [235, 245, 255] },
      1: { cellWidth: CW - 72 },
    },
  })

  y = doc.lastAutoTable.finalY + 8

  // ── 3. PROGRAMACIÓN SEMANAL ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C_LABEL)
  doc.text('PROGRAMACION SEMANAL', ML, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Semana', 'Periodo', 'Riego neto (m3/ha)']],
    body: [
      ...programacion_semanal.map(r => [
        r.semana,
        `${r.fecha_ini} - ${r.fecha_fin}`,
        r.riego_neto_m3ha > 0 ? fmtN(r.riego_neto_m3ha) : '—',
      ]),
      ['', 'TOTAL', fmtN(totalRiego)],
    ],
    margin:     { left: ML, right: MR },
    tableWidth: CW,
    styles: {
      fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
      lineColor: C_BORDER, lineWidth: 0.2, font: 'helvetica',
      textColor: C_LABEL, valign: 'middle',
    },
    headStyles: {
      fillColor: C_TITLE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right',
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right' },
      1: { cellWidth: CW - 22 - 38, halign: 'left' },
      2: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      // Fila TOTAL: fondo azul claro
      if (data.row.index === programacion_semanal.length) {
        data.cell.styles.fillColor = [220, 235, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = C_TITLE
      }
      // Celdas con riego: azul oscuro
      if (data.column.index === 2 && data.row.index < programacion_semanal.length) {
        const val = programacion_semanal[data.row.index]?.riego_neto_m3ha || 0
        if (val > 0) data.cell.styles.textColor = C_TITLE
        else         data.cell.styles.textColor = [180, 180, 180]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── 4. BALANCE HÍDRICO MENSUAL ────────────────────────────────────────────
  // Nueva página si no hay espacio suficiente
  if (y > 220) { doc.addPage(); y = MT }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C_LABEL)
  doc.text('BALANCE HIDRICO MENSUAL', ML, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Mes', 'ETo\n(mm/dia)', 'Kc', 'ETc\n(mm)', 'P\n(mm)', 'Pe\n(mm)', 'NHN\n(m3/ha)', 'Asignado\n(m3/ha)']],
    body: balance_mensual.map(r => [
      r.mes,
      fmtN(r.eto_mm_dia, 2),
      fmtN(r.kc, 2),
      fmtN(r.etc_mm),
      fmtN(r.p_mm, 1),
      fmtN(r.pe_mm, 1),
      r.nhn_m3ha > 0 ? fmtN(r.nhn_m3ha) : '—',
      r.asignado_m3ha > 0 ? fmtN(r.asignado_m3ha) : '—',
    ]),
    margin:     { left: ML, right: MR },
    tableWidth: CW,
    styles: {
      fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: C_BORDER, lineWidth: 0.2, font: 'helvetica',
      textColor: C_LABEL, valign: 'middle', halign: 'right',
    },
    headStyles: {
      fillColor: C_TITLE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right', fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'left' },
      1: { cellWidth: 20 },
      2: { cellWidth: 14 },
      3: { cellWidth: 18 },
      4: { cellWidth: 18 },
      5: { cellWidth: 18 },
      6: { cellWidth: 24 },
      7: { cellWidth: CW - 18 - 20 - 14 - 18 - 18 - 18 - 24 },
    },
    didParseCell(data) {
      if (data.column.index === 7 && data.section === 'body') {
        const val = balance_mensual[data.row.index]?.asignado_m3ha || 0
        if (val > 0) { data.cell.styles.textColor = C_TITLE; data.cell.styles.fontStyle = 'bold' }
      }
    },
  })

  // Nota al pie de tabla
  const noteY = doc.lastAutoTable.finalY + 3
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_MUTED)
  doc.text('NHN = Necesidad Hidrica Neta (ETc - Pe)  ·  Pe = Precipitacion efectiva  ·  Fuente climatica: SiAR MAPA (ETo oficial)', ML, noteY)

  // ── 5. PIE DE PÁGINA ─────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const footerY = doc.internal.pageSize.getHeight() - MB + 2
    doc.setDrawColor(...C_BORDER)
    doc.setLineWidth(0.3)
    doc.line(ML, footerY, PW - MR, footerY)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C_MUTED)
    doc.text(`Pagina ${i}/${totalPages}`, PW / 2, footerY + 5, { align: 'center' })
    doc.text('FertiPRO', ML, footerY + 5)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, PW - MR, footerY + 5, { align: 'right' })
  }

  // ── 6. DESCARGA ───────────────────────────────────────────────────────────
  const nombreCultivo = cultivo?.name ? cultivo.name.replace(/\s+/g, '_').slice(0, 30) : 'cultivo'
  doc.save(`plan_riego_${nombreCultivo}.pdf`)
}
