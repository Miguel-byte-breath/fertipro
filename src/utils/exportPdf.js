/**
 * src/utils/exportPdf.js
 *
 * Genera y descarga el "Plan de Nutrientes de una Parcela" en PDF,
 * siguiendo el estilo del informe oficial Sativum (ITACyL).
 *
 * Dependencias (importación dinámica para no inflar el bundle inicial):
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
  recintos             = [],   // lista plana de todos los recintos intersectados
  supTotalHa           = null, // superficie total ha (suma parcelas)
  riego,
  npk,
  recomendacion        = null,
  nRiego               = 0,
  pRiego               = 0,
  kRiego               = 0,
  baseName             = 'fertipro_plan_nutrientes',
}) {
  // ── Carga dinámica de jsPDF ───────────────────────────────────────────────
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then(m => m.default ?? m),
  ])

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
  const tieneRiego   = riego?.fuenteId !== 0 && (nRiegoPct || p2o5Riego || k2oRiego)

  // ── Superficie total ──────────────────────────────────────────────────────
  const sup = supTotalHa != null && !isNaN(supTotalHa) && supTotalHa > 0
    ? supTotalHa
    : null

  // ── Refs SIGPAC ───────────────────────────────────────────────────────────
  const refsTexto = recintos.length > 0
    ? recintos.map(fmtRef).join(', ')
    : (riego?._refSigpac ?? null)

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
  doc.text('Motor: FertiliCalc (Villalobos et al. 2020)', PW - MR, y + 9, { align: 'right' })
  doc.text('API Sativum · ITACyL', PW - MR, y + 13, { align: 'right' })

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
  const regimenHidrico = riego?.fuenteId !== 0 ? 'Regadío' : 'Secano'
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
  if (refsTexto) {
    // Si las refs son largas, dividir en varias líneas
    const lines = doc.splitTextToSize(refsTexto, CW - doc.getTextWidth('Referencia SIGPAC de la parcela: '))
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_LABEL)
    const lblW = doc.getTextWidth('Referencia SIGPAC de la parcela: ')
    doc.text('Referencia SIGPAC de la parcela: ', ML, y)
    doc.setFont('helvetica', 'normal')
    doc.text(lines, ML + lblW, y)
    y += metaLineHeight * Math.max(1, lines.length)
  }

  metaRow('Fecha del plan de nutrientes', fechaFmt)

  y += 4

  // ── 4. RECUADRO NPK ───────────────────────────────────────────────────────
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
    { label: 'P₂O₅', value: fmt(p2o5, 1) },
    { label: 'P',     value: fmt(p, 1) },
    { label: 'K₂O',  value: fmt(k2o, 1) },
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

  // ── 5. TABLA FERTILIZANTES ────────────────────────────────────────────────
  // Construir filas
  const tableRows = []

  // Fila agua de riego (si hay)
  const tieneAguaRiego = riego?.fuenteId !== 0 && Number(riego?.dotacionM3) > 0
  if (tieneAguaRiego) {
    const dotHa    = Number(riego.dotacionM3)
    const dotTotal = sup != null ? dotHa * sup : null
    tableRows.push({
      _type:     'riego',
      nombre:    (riego.fuenteLabel ?? 'Agua de riego').toUpperCase(),
      cantHa:    `${fmtNum(dotHa, 0)} m³/ha`,
      cantTotal: dotTotal != null ? `${fmtNum(dotTotal, 0)} m³` : '—',
      ufn:       nRiegoPct  != null ? fmt(nRiegoPct, 1)   : '—',
      ufp:       p2o5Riego  != null ? fmt(p2o5Riego, 1)   : '—',
      ufk:       k2oRiego   != null ? fmt(k2oRiego, 1)    : '—',
    })
  }

  // Filas fertilizantes de /recommendation
  const recList = Array.isArray(recomendacion) ? recomendacion : []
  recList.forEach((rec, ri) => {
    const ferts = rec.unique ?? []
    // Cabecera de opción (si hay más de una)
    if (recList.length > 1) {
      tableRows.push({ _type: 'opcion', label: `Opción ${ri + 1}` })
    }
    ferts.forEach(f => {
      const dose     = f.quantity
      const fn       = dose != null ? f.n    * dose / 100 : null
      const fp2o5    = dose != null ? f.p2o5 * dose / 100 : null
      const fk2o     = dose != null ? f.k2o  * dose / 100 : null
      const cantTotal = (dose != null && sup != null) ? dose * sup : null
      tableRows.push({
        _type:     'fert',
        nombre:    f.name ?? f.shortName ?? `Fertilizante ${ri + 1}`,
        cantHa:    dose != null ? `${fmtNum(dose, 0)} kg/ha` : '—',
        cantTotal: cantTotal != null ? `${fmtNum(cantTotal, 0)} kg` : '—',
        ufn:       fn    != null ? fmt(fn, 1)    : '—',
        ufp:       fp2o5 != null ? fmt(fp2o5, 1) : '—',
        ufk:       fk2o  != null ? fmt(fk2o, 1)  : '—',
      })
    })
    if (rec.observations) {
      tableRows.push({ _type: 'obs', label: rec.observations })
    }
  })

  // Convertir a array de arrays para autoTable
  const head = [['FERTILIZANTE', 'CANTIDAD/HA', 'CANTIDAD TOTAL', 'UFN (kg/ha)', 'UFP (kg/ha)', 'UFK (kg/ha)']]
  const body = tableRows.map(r => {
    if (r._type === 'opcion') {
      return [{ content: r.label, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [220, 237, 233], textColor: C_TEAL } }]
    }
    if (r._type === 'obs') {
      return [{ content: `ⓘ ${r.label}`, colSpan: 6, styles: { fontStyle: 'italic', fontSize: 7.5, fillColor: C_WARN_BG, textColor: [120, 90, 0] } }]
    }
    return [r.nombre, r.cantHa, r.cantTotal, r.ufn, r.ufp, r.ufk]
  })

  if (body.length === 0) {
    body.push([{ content: 'Sin recomendaciones de fertilizantes disponibles.', colSpan: 6, styles: { fontStyle: 'italic', textColor: C_MUTED } }])
  }

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: ML, right: MR },
    tableWidth: CW,
    styles: {
      fontSize:    8.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor:   C_BORDER,
      lineWidth:   0.2,
      font:        'helvetica',
      textColor:   C_LABEL,
      valign:      'middle',
    },
    headStyles: {
      fillColor:    C_TEAL,
      textColor:    [255, 255, 255],
      fontStyle:    'bold',
      fontSize:     8.5,
      halign:       'center',
    },
    columnStyles: {
      0: { cellWidth: 58,  halign: 'left'   },
      1: { cellWidth: 28,  halign: 'right'  },
      2: { cellWidth: 30,  halign: 'right'  },
      3: { cellWidth: 19,  halign: 'right'  },
      4: { cellWidth: 19,  halign: 'right'  },
      5: { cellWidth: 20,  halign: 'right'  },
    },
    alternateRowStyles: { fillColor: C_TEAL_LT },
    didParseCell(data) {
      // Fila de riego: fondo azul claro
      if (data.section === 'body') {
        const row = tableRows[data.row.index]
        if (row?._type === 'riego') {
          data.cell.styles.fillColor = C_RIEGO
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  // ── 6. PIE DE PÁGINA (paginación X/N) ─────────────────────────────────────
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

  // ── 7. DESCARGA ───────────────────────────────────────────────────────────
  doc.save(`${baseName}.pdf`)
}
