/**
 * src/utils/exportExcel.js
 *
 * Genera y descarga un Excel con la composición SIGPAC de una o varias
 * parcelas (hoja de cultivo). Dos hojas:
 *
 *   "Resumen"  — una fila por parcela
 *     Parcela · Tipo · Sup. parcela (ha) · Sup. SIGPAC (ha) · % cubierto · Nº recintos
 *
 *   "Recintos" — una fila por par parcela × recinto
 *     Parcela · Provincia · Municipio · Polígono · Parcela SIGPAC · Recinto ·
 *     Ref. completa · Uso SIGPAC · Sup. recinto (ha) · Sup. intersección (ha) ·
 *     % recinto ocupado · Pendiente (%) · Altitud (m) · Observación
 *
 * La librería SheetJS (`xlsx`) se importa dinámicamente para que no infle
 * el bundle inicial de la app — solo se descarga cuando el usuario hace clic
 * en "Exportar Excel".
 */
import area from '@turf/area'

/**
 * Descarga el Excel.
 *
 * @param {Array<{
 *   nombre: string,
 *   tipo: 'SIGPAC' | 'SIGPAC modificada' | 'Libre',
 *   feature: GeoJSON.Feature,
 *   recintos: Array<object>,   // salida de interseccionRecintos()
 * }>} parcelas
 * @param {string} baseName  — nombre del fichero sin extensión.
 */
export async function exportarRecintosSigpacExcel(parcelas, baseName = 'fertipro_sigpac') {
  const mod   = await import('xlsx')
  const XLSX  = mod.default ?? mod

  // ── Hoja "Resumen" ────────────────────────────────────────────────────
  const resumen = parcelas.map(p => {
    const supParcelaHa = p.feature ? area(p.feature) / 10000 : null
    const supSigpacHa  = p.recintos.reduce(
      (s, r) => s + (Number(r.superficie_interseccion_ha) || 0), 0
    )
    const pctCubierto = supParcelaHa && supParcelaHa > 0
      ? (supSigpacHa / supParcelaHa) * 100
      : null
    return {
      'Parcela':            p.nombre,
      'Tipo':               p.tipo,
      'Sup. parcela (ha)':  num(supParcelaHa, 4),
      'Sup. SIGPAC (ha)':   num(supSigpacHa, 4),
      '% cubierto':         num(pctCubierto, 1),
      'Nº recintos':        p.recintos.length,
    }
  })

  // ── Hoja "Recintos" ───────────────────────────────────────────────────
  const recintos = []
  for (const p of parcelas) {
    for (const r of p.recintos) {
      const ref = [r.provincia, r.municipio, r.poligono, r.parcela, r.recinto]
        .filter(v => v != null && v !== '')
        .join('/')
      recintos.push({
        'Parcela':                p.nombre,
        'Provincia':              r.provincia ?? null,
        'Municipio':              r.municipio ?? null,
        'Polígono':               r.poligono  ?? null,
        'Parcela SIGPAC':         r.parcela   ?? null,
        'Recinto':                r.recinto   ?? null,
        'Ref. completa':          ref || null,
        'Uso SIGPAC':             r.uso_sigpac ?? null,
        'Sup. recinto (ha)':      num(r.superficie_total_ha, 4),
        'Sup. intersección (ha)': num(r.superficie_interseccion_ha, 4),
        '% recinto ocupado':      num(r.pct_ocupado, 1),
        'Pendiente (%)':          num(r.pendiente_media, 2),
        'Altitud (m)':            num(r.altitud, 0),
        'Observación':            r.observacion,
      })
    }
  }

  const wb = XLSX.utils.book_new()

  const wsResumen = XLSX.utils.json_to_sheet(resumen)
  wsResumen['!cols'] = [
    { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  const wsRecintos = XLSX.utils.json_to_sheet(recintos)
  wsRecintos['!cols'] = [
    { wch: 24 }, // Parcela
    { wch:  9 }, // Provincia
    { wch: 11 }, // Municipio
    { wch:  9 }, // Polígono
    { wch: 14 }, // Parcela SIGPAC
    { wch:  9 }, // Recinto
    { wch: 20 }, // Ref. completa
    { wch: 11 }, // Uso SIGPAC
    { wch: 18 }, // Sup. recinto
    { wch: 22 }, // Sup. intersección
    { wch: 17 }, // % recinto ocupado
    { wch: 14 }, // Pendiente
    { wch: 12 }, // Altitud
    { wch: 14 }, // Observación
  ]
  XLSX.utils.book_append_sheet(wb, wsRecintos, 'Recintos')

  // Hoja "Notas" — pequeña hoja con metadatos del informe (opcional pero útil)
  const notas = [
    { 'Campo': 'Fichero generado',  'Valor': baseName + '.xlsx' },
    { 'Campo': 'Fecha',             'Valor': new Date().toISOString() },
    { 'Campo': 'Origen geometría',  'Valor': 'FertiPRO — definida por el usuario' },
    { 'Campo': 'Fuente recintos',   'Valor': 'SIGPAC (FEGA) · OGC API · CC BY 4.0' },
    { 'Campo': 'CRS',               'Valor': 'EPSG:4326 (WGS84)' },
    { 'Campo': 'Cálculo intersección', 'Valor': 'Cliente — @turf/intersect v7' },
    { 'Campo': 'Umbral "Completo"',        'Valor': '≥ 99,5 % del recinto ocupado por la parcela' },
    { 'Campo': 'Etiqueta "Recortado"',     'Valor': 'El usuario ha modificado la geometría de la parcela (tijera o edición de vértices)' },
    { 'Campo': 'Etiqueta "Parcial"',       'Valor': 'Parcela libre que intersecta una porción del recinto sin intervención del usuario' },
  ]
  const wsNotas = XLSX.utils.json_to_sheet(notas)
  wsNotas['!cols'] = [{ wch: 22 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsNotas, 'Notas')

  XLSX.writeFile(wb, `${baseName}.xlsx`)
}

/** Redondea preservando null/NaN para que Excel no escriba "0" donde no toca. */
function num(v, dec = 2) {
  if (v == null || isNaN(v)) return null
  return Number(Number(v).toFixed(dec))
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan de Abonado completo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descarga el plan de abonado completo en Excel (3 hojas).
 *
 * @param {object} opts
 * @param {object}  opts.point       — { lon, lat }
 * @param {object}  [opts.recinto]   — datos SIGPAC
 * @param {object}  opts.cultivo     — objeto catálogo Sativum
 * @param {object}  [opts.suelo]     — resultado normalizarSuelo()
 * @param {number}  opts.cec         — meq/kg
 * @param {object}  opts.riego       — { fuenteId, fuenteLabel, no3MgL, dotacionM3 }
 * @param {object}  opts.calculo     — { strategy, tillage, cropYield, recogeResiduos }
 * @param {object}  opts.npk         — respuesta /algo/ con .n .p .k
 * @param {object}  [opts.recomendacion] — respuesta /recommendation
 * @param {string}  [opts.baseName]
 */
export async function exportarPlanAbonado({
  point,
  recinto,
  cultivo,
  suelo,
  cec,
  riego,
  calculo,
  npk,
  recomendacion,
  baseName = 'fertipro_plan_abonado',
}) {
  const mod  = await import('xlsx')
  const XLSX = mod.default ?? mod

  const P_TO_P2O5 = 2.2914
  const K_TO_K2O  = 1.2046

  const n = num(npk?.n, 1)
  const p = num(npk?.p, 1)
  const k = num(npk?.k, 1)

  // ── Hoja 1: Plan de Abonado ─────────────────────────────────────────────
  const plan = []
  const row = (campo, valor, unidad = '') => plan.push({ 'Campo': campo, 'Valor': valor ?? '—', 'Unidad': unidad })

  row('Fecha',            new Date().toLocaleDateString('es-ES'))
  row('Longitud',         num(point?.lon, 5), '°')
  row('Latitud',          num(point?.lat, 5), '°')
  if (recinto) {
    row('Municipio SIGPAC',  recinto.municipio ?? null)
    row('Uso SIGPAC',        recinto.uso_sigpac ?? null)
    row('Superficie recinto',num(recinto.superficie_ha, 4), 'ha')
  }
  row('', null)   // spacer
  row('Cultivo',           cultivo?.name)
  row('Grupo',             cultivo?.plantSpeciesGroup)
  row('Rendimiento objetivo', num(calculo?.cropYield ?? cultivo?.yieldMedium, 2), 't/ha')
  row('Estrategia',        calculo?.strategy)
  row('Laboreo',           calculo?.tillage ? 'Sí' : 'No')
  row('Residuos recogidos',calculo?.recogeResiduos ? 'Sí' : 'No')
  row('', null)
  row('Tipo de suelo',     suelo?.soilType)
  row('Materia orgánica',  num(suelo?.organicMatter, 2), '%')
  row('pH',                num(suelo?.ph, 1))
  row('P Olsen',           num(suelo?.pOlsen, 1), 'ppm')
  row('K suelo',           num(suelo?.kSoil, 0), 'ppm')
  row('CEC',               num(cec, 0), 'meq/kg')
  row('', null)
  row('Fuente agua riego', riego?.fuenteLabel ?? (riego?.fuenteId === 0 ? 'Sin riego' : `Fuente ${riego?.fuenteId}`))
  if (riego?.fuenteId !== 0) {
    row('NO₃ agua riego',   num(riego?.no3MgL, 1), 'mg/L')
    row('Dotación riego',   num(riego?.dotacionM3, 0), 'm³/ha')
  }
  row('', null)
  row('N necesario',        n,                           'kg N/ha')
  row('P necesario (puro)', p,                           'kg P/ha')
  row('P₂O₅ necesario',    num(p * P_TO_P2O5, 1),       'kg P₂O₅/ha')
  row('K necesario (puro)', k,                           'kg K/ha')
  row('K₂O necesario',     num(k * K_TO_K2O, 1),        'kg K₂O/ha')

  const wsPlan = XLSX.utils.json_to_sheet(plan)
  wsPlan['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 14 }]

  // ── Hoja 2: Fertilizantes ───────────────────────────────────────────────
  const fertRows = []
  const recs = recomendacion?.recommendations ?? []
  recs.forEach((rec, ri) => {
    const ferts = rec.fertilizers ?? []
    ferts.forEach(f => {
      const dose   = f.dose ?? f.quantity ?? f.appliedQuantity
      const fn     = f.n  ?? f.appliedN
      const fp     = f.p  ?? f.appliedP
      const fk     = f.k  ?? f.appliedK
      fertRows.push({
        'Combinación':     ri + 1,
        'Fertilizante':    f.name ?? f.fertilizer?.name ?? `Fert. ${ri + 1}`,
        'Dosis (kg/ha)':   num(dose, 0),
        'N aportado':      num(fn, 1),
        'P aportado (puro)': num(fp, 1),
        'P₂O₅ aportado':  num(fp != null ? fp * P_TO_P2O5 : null, 1),
        'K aportado (puro)': num(fk, 1),
        'K₂O aportado':   num(fk != null ? fk * K_TO_K2O : null, 1),
      })
    })
    // Total
    const tot = rec.totalApplied ?? rec.total
    if (tot) {
      fertRows.push({
        'Combinación': ri + 1,
        'Fertilizante': '— TOTAL —',
        'Dosis (kg/ha)': null,
        'N aportado':    num(tot.n, 1),
        'P aportado (puro)': num(tot.p, 1),
        'P₂O₅ aportado':  num(tot.p != null ? tot.p * P_TO_P2O5 : null, 1),
        'K aportado (puro)': num(tot.k, 1),
        'K₂O aportado':  num(tot.k != null ? tot.k * K_TO_K2O : null, 1),
      })
    }
  })

  const wsFert = XLSX.utils.json_to_sheet(
    fertRows.length > 0 ? fertRows : [{ 'Info': 'No hay recomendaciones de fertilizantes disponibles.' }]
  )
  wsFert['!cols'] = [
    { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
  ]

  // ── Hoja 3: Notas ───────────────────────────────────────────────────────
  const notas = [
    { 'Campo': 'Aplicación',          'Valor': 'FertiPRO' },
    { 'Campo': 'Motor de cálculo',    'Valor': 'FertiliCalc (Villalobos et al. 2020) vía API Sativum (ITACyL)' },
    { 'Campo': 'Fuente suelo',        'Valor': 'ArcGIS MapServer Sativum / ITACyL' },
    { 'Campo': 'Fuente recintos',     'Valor': 'SIGPAC (FEGA) · OGC API · CC BY 4.0' },
    { 'Campo': 'Fecha generación',    'Valor': new Date().toISOString() },
    { 'Campo': 'Unidades NPK',        'Valor': 'kg/ha (elemento puro); P₂O₅ y K₂O son formas de óxido' },
    { 'Campo': 'Conversión P→P₂O₅',  'Valor': '× 2.2914' },
    { 'Campo': 'Conversión K→K₂O',   'Valor': '× 1.2046' },
  ]
  const wsNotas = XLSX.utils.json_to_sheet(notas)
  wsNotas['!cols'] = [{ wch: 22 }, { wch: 60 }]

  // ── Ensamblar y descargar ───────────────────────────────────────────────
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsPlan,  'Plan de Abonado')
  XLSX.utils.book_append_sheet(wb, wsFert,  'Fertilizantes')
  XLSX.utils.book_append_sheet(wb, wsNotas, 'Notas')

  XLSX.writeFile(wb, `${baseName}.xlsx`)
}
