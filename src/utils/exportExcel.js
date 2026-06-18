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
        'Coef. regadío (%)':      r.coef_regadio ?? null,
        'Sup. recinto (ha)':      num(r.superficie_total_ha, 4),
        'Sup. intersección (ha)': num(r.superficie_interseccion_ha, 4),
        '% recinto ocupado':      num(r.pct_ocupado, 1),
        'Pendiente (%)':          num(r.pendiente_media, 2),
        'Altitud (m)':            num(r.altitud, 0),
        'Observación':            r.observacion,
        'ZVN':                    r.enZvn === true ? 'S' : (r.enZvn === false ? 'N' : null),
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
    { wch: 18 }, // Coef. regadío
    { wch: 18 }, // Sup. recinto
    { wch: 22 }, // Sup. intersección
    { wch: 17 }, // % recinto ocupado
    { wch: 14 }, // Pendiente
    { wch: 12 }, // Altitud
    { wch: 14 }, // Observación
    { wch:  6 }, // ZVN
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
    { 'Campo': 'Columna ZVN',              'Valor': 'S = recinto intersecta una Zona Vulnerable a Nitratos (RD 1051/2022) · N = no intersecta · vacío = no consultado' },
    { 'Campo': 'Fuente ZVN',               'Valor': 'SIGPAC (FEGA) — servicio intersection/nitratos' },
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

// Etiquetas legibles para tipo de suelo (textura simplificada Sativum)
const SOIL_TYPE_LABEL = {
  SANDY:      'Arenosa',
  SANDY_LOAM: 'Franco arenosa',
  LOAM:       'Franca',
  SILTY_LOAM: 'Franco limosa',
  CLAY_LOAM:  'Franco arcillosa',
  CLAY:       'Arcillosa',
}

/**
 * Descarga el plan de abonado completo en Excel (3 hojas).
 *
 * @param {object} opts
 * @param {object}  opts.point                — { lon, lat }
 * @param {object}  [opts.recinto]            — datos SIGPAC
 * @param {object}  opts.cultivo              — objeto catálogo Sativum
 * @param {object}  [opts.suelo]             — resultado normalizarSuelo()
 * @param {number}  opts.cec                  — meq/kg
 * @param {object}  opts.riego               — { fuenteId, fuenteLabel, no3MgL, dotacionM3 }
 * @param {object}  opts.calculo             — { strategy, tillage, cropYield, recogeResiduos, quemaResiduos }
 * @param {string}  [opts.fecha]             — fecha del plan (YYYY-MM-DD)
 * @param {object}  opts.npk                  — respuesta bruta /algo/
 * @param {object}  [opts.recomendacion]     — respuesta /recommendation (array)
 * @param {string}  [opts.adjustedNutrient]  — 'N' | 'P' | 'K'
 * @param {object}  [opts.cultivoAnterior]   — objeto cultivo precedente
 * @param {object}  [opts.cultivoAnteriorParams] — { cropYield, laboreo, recogeResiduos, quemaResiduos }
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
  fecha,
  fechaInicioCiclo = null,
  fechaFinCiclo    = null,
  npk,
  recomendacion,
  adjustedNutrient = null,
  cultivoAnterior = null,
  cultivoAnteriorParams = null,
  asesor = null,
  fertilizadoresManuales = [],
  baseName = 'fertipro_plan_abonado',
}) {
  const mod  = await import('xlsx')
  const XLSX = mod.default ?? mod

  const P_TO_P2O5 = 2.2914
  const K_TO_K2O  = 1.2046

  // NPK: top-level con fallback al último item de recommendations (cultivo actual)
  const lastRec = npk?.recommendations?.at(-1)
  const nVal = npk?.n ?? lastRec?.n
  const pVal = npk?.p ?? lastRec?.p
  const kVal = npk?.k ?? lastRec?.k
  const n = num(nVal, 1)
  const p = num(pVal, 1)
  const k = num(kVal, 1)

  // Aportaciones por riego (kg elemento/ha)
  const no3 = Number(riego?.no3MgL)    || 0
  const dot = Number(riego?.dotacionM3) || 0
  const p_r = Number(riego?.pMgL)      || 0
  const k_r = Number(riego?.kMgL)      || 0
  const tieneRiego = riego?.fuenteId !== 0 && dot > 0

  const nRiegoVal = tieneRiego && no3 > 0 ? no3 * dot / 1000 * (14 / 62) : 0
  const nRiego    = nRiegoVal > 0 ? num(nRiegoVal, 1) : null
  // N bruto = N_motor (ya neto, el motor lo descontó via n_other) + N_riego
  const nBruto    = num((nVal ?? 0) + nRiegoVal, 1)
  const pRiego  = tieneRiego && p_r > 0 ? p_r * dot / 1000 : 0   // kg P/ha
  const kRiego  = tieneRiego && k_r > 0 ? k_r * dot / 1000 : 0   // kg K/ha

  // NPK neto = bruto - riego (floor 0)
  const pNeto = Math.max(0, (pVal ?? 0) - pRiego)
  const kNeto = Math.max(0, (kVal ?? 0) - kRiego)

  // ── Hoja 1: Plan de Abonado ─────────────────────────────────────────────
  const plan = []
  const row = (campo, valor, unidad = '') => plan.push({ 'Campo': campo, 'Valor': valor ?? '—', 'Unidad': unidad })

  row('Fecha', fecha
    ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES')
    : new Date().toLocaleDateString('es-ES'))
  if (fechaInicioCiclo) row('Inicio de ciclo', new Date(fechaInicioCiclo + 'T00:00:00').toLocaleDateString('es-ES'))
  if (fechaFinCiclo)    row('Fin de ciclo',    new Date(fechaFinCiclo    + 'T00:00:00').toLocaleDateString('es-ES'))
  if (asesor?.nombre || asesor?.regfer) {
    const nombreCompleto = [asesor.nombre, asesor.apellidos].filter(Boolean).join(' ')
    row('Asesor responsable del plan', nombreCompleto || null)
    if (asesor.regfer)   row('Nº REGFER', asesor.regfer)
    if (asesor.nif)      row('NIF asesor', asesor.nif)
    if (asesor.telefono) row('Teléfono asesor', asesor.telefono)
    if (asesor.email)    row('Email asesor', asesor.email)
  }
  row('Longitud', num(point?.lon, 5), '°')
  row('Latitud',  num(point?.lat, 5), '°')
  if (recinto) {
    row('Municipio SIGPAC',   recinto.municipio  ?? null)
    row('Uso SIGPAC',         recinto.uso_sigpac ?? null)
    row('Superficie recinto', num(recinto.superficie_total_ha ?? recinto.superficie_ha, 4), 'ha')
  }

  row('', null)  // spacer

  row('Cultivo',               cultivo?.name)
  row('Grupo',                 cultivo?.plantSpeciesGroup)
  row('Rendimiento objetivo',  num(calculo?.cropYield ?? cultivo?.yieldMedium, 2), 'kg/ha')
  row('Estrategia',            calculo?.strategy)
  row('Laboreo',               calculo?.tillage          ? 'Sí' : 'No')
  row('Residuos recogidos',    calculo?.recogeResiduos   ? 'Sí' : 'No')
  if (calculo?.recogeResiduos) {
    row('Quema residuos',      calculo?.quemaResiduos    ? 'Sí' : 'No')
  }
  if (adjustedNutrient) {
    row('Nutriente ajustado',  adjustedNutrient)
  }

  row('', null)

  // Cultivo anterior
  if (cultivoAnterior) {
    row('Cultivo precedente',         cultivoAnterior.name)
    row('  Rendimiento precedente',   num(cultivoAnteriorParams?.cropYield ?? cultivoAnterior.yieldMedium, 2), 'kg/ha')
    row('  Laboreo tras cosecha',     cultivoAnteriorParams?.laboreo        ? 'Sí' : 'No')
    row('  Residuos precedente',      cultivoAnteriorParams?.recogeResiduos ? 'Recogidos' : 'Incorporados')
    if (cultivoAnteriorParams?.recogeResiduos) {
      row('  Quema residuos precedente', cultivoAnteriorParams?.quemaResiduos ? 'Sí' : 'No')
    }
    row('', null)
  }

  const soilLabel = suelo?.soilType
    ? `${SOIL_TYPE_LABEL[suelo.soilType] ?? suelo.soilType} (${suelo.soilType})`
    : null
  row('Textura suelo',      soilLabel)
  row('Materia orgánica',   num(suelo?.organicMatter, 2), '%')
  row('pH',                 num(suelo?.ph, 1))
  row('P Olsen',            num(suelo?.pOlsen, 1),  'ppm')
  row('K suelo',            num(suelo?.kSoil, 0),   'ppm')
  row('CEC',                num(cec, 0),             'meq/kg')

  row('', null)

  row('Fuente agua riego', riego?.fuenteLabel ?? (riego?.fuenteId === 0 ? 'Sin riego' : `Fuente ${riego?.fuenteId}`))
  row('Sistema de explotación', riego?.fuenteId !== 0 ? 'Regadío' : 'Secano')
  if (riego?.fuenteId !== 0) {
    row('NO₃ agua riego',    num(riego?.no3MgL, 1),     'mg/L')
    row('P agua riego',      num(riego?.pMgL,   1),     'mg/L')
    row('K agua riego',      num(riego?.kMgL,   1),     'mg/L')
    row('Dotación riego',    num(riego?.dotacionM3, 0),  'm³/ha')
    if (suelo?.kIrrigation != null) {
      row('K riego (ArcGIS)', num(suelo.kIrrigation, 1), 'mg/L')
    }
    if (nRiego != null || pRiego > 0 || kRiego > 0) {
      if (nRiego != null) row('N aportado riego',    nRiego,                            'kg N/ha')
      if (pRiego  > 0)    row('P₂O₅ aportado riego', num(pRiego * P_TO_P2O5, 1),       'kg P₂O₅/ha')
      if (kRiego  > 0)    row('K₂O aportado riego',  num(kRiego * K_TO_K2O,  1),       'kg K₂O/ha')
    }
  }

  row('', null)

  // Bloque NPK: bruto (necesidad total cultivo) → cubierto riego → neto (fertilizante)
  // N bruto = N_motor + N_riego (el motor ya descontó el N del riego via n_other)
  row('— Necesidades brutas (cultivo) —', null)
  row('N bruto',    nBruto,                       'kg N/ha')
  row('P₂O₅ bruto', num(p * P_TO_P2O5, 1),       'kg P₂O₅/ha')
  row('P bruto',    p,                            'kg P/ha')
  row('K₂O bruto',  num(k * K_TO_K2O,  1),       'kg K₂O/ha')
  row('K bruto',    k,                            'kg K/ha')

  if (nRiegoVal > 0 || pRiego > 0 || kRiego > 0) {
    row('', null)
    row('— Cubierto por riego —', null)
    if (nRiego  != null) row('N por riego',     nRiego,                          'kg N/ha')
    if (pRiego  > 0)     row('P₂O₅ por riego',  num(pRiego * P_TO_P2O5, 1),     'kg P₂O₅/ha')
    if (kRiego  > 0)     row('K₂O por riego',   num(kRiego * K_TO_K2O,  1),     'kg K₂O/ha')

    row('', null)
    row('— A cubrir con fertilizante (neto) —', null)
    row('N neto',    n,                                   'kg N/ha')   // = N_motor (ya neto)
    row('P₂O₅ neto', num(pNeto * P_TO_P2O5, 1),          'kg P₂O₅/ha')
    row('P neto',    num(pNeto, 1),                       'kg P/ha')
    row('K₂O neto',  num(kNeto * K_TO_K2O,  1),          'kg K₂O/ha')
    row('K neto',    num(kNeto, 1),                       'kg K/ha')
  }

  const wsPlan = XLSX.utils.json_to_sheet(plan)
  wsPlan['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 14 }]

  // ── Hoja 2: Fertilizantes ───────────────────────────────────────────────
  // Estructura real de /recommendation: [{unique:[{name,n,p2o5,k2o,quantity,...}], observations:""}]
  const fertRows = []
  const recList = Array.isArray(recomendacion) ? recomendacion : []
  recList.forEach((rec, ri) => {
    const ferts = rec.unique ?? []
    ferts.forEach(f => {
      const dose  = f.quantity
      const fn    = dose != null ? f.n    * dose / 100 : null
      const fp2o5 = dose != null ? f.p2o5 * dose / 100 : null
      const fk2o  = dose != null ? f.k2o  * dose / 100 : null
      fertRows.push({
        'Origen':                'Propuesta API Sativum',
        'Combinación':           ri + 1,
        'Fertilizante':          f.name ?? `Fert. ${ri + 1}`,
        '% N':                   num(f.n,    1),
        '% P₂O₅':               num(f.p2o5, 1),
        '% K₂O':                num(f.k2o,  1),
        'Dosis (kg/ha)':         num(dose, 0),
        'N aportado (kg/ha)':    num(fn,    1),
        'P₂O₅ aportado (kg/ha)':num(fp2o5, 1),
        'K₂O aportado (kg/ha)': num(fk2o,  1),
        'Fecha aplicación':      null,
        'ΣN (kg/ha)':            null,
        'ΣP₂O₅ (kg/ha)':        null,
        'ΣK₂O (kg/ha)':         null,
      })
    })
    if (rec.observations) {
      fertRows.push({
        'Origen':                'Propuesta API Sativum',
        'Combinación':           ri + 1,
        'Fertilizante':          `Observación: ${rec.observations}`,
        '% N': null, '% P₂O₅': null, '% K₂O': null,
        'Dosis (kg/ha)': null,
        'N aportado (kg/ha)': null, 'P₂O₅ aportado (kg/ha)': null, 'K₂O aportado (kg/ha)': null,
        'Fecha aplicación': null, 'ΣN (kg/ha)': null, 'ΣP₂O₅ (kg/ha)': null, 'ΣK₂O (kg/ha)': null,
      })
    }
  })

  // ── Filas de selección manual (con running totals) ─────────────────────
  const manList = Array.isArray(fertilizadoresManuales) ? fertilizadoresManuales : []
  if (manList.length > 0) {
    // Fila separadora
    fertRows.push({
      'Origen': '--- SELECCIÓN MANUAL DEL ASESOR ---',
      'Combinación': null, 'Fertilizante': null,
      '% N': null, '% P₂O₅': null, '% K₂O': null, 'Dosis (kg/ha)': null,
      'N aportado (kg/ha)': null, 'P₂O₅ aportado (kg/ha)': null, 'K₂O aportado (kg/ha)': null,
      'Fecha aplicación': null, 'ΣN (kg/ha)': null, 'ΣP₂O₅ (kg/ha)': null, 'ΣK₂O (kg/ha)': null,
    })
    let sigN = 0; let sigP2o5 = 0; let sigK2o = 0
    manList.forEach((item, i) => {
      const dose  = Number(item.cantidad) || 0
      const aN    = num((item.n    ?? 0) * dose / 100, 1)
      const aP2o5 = num((item.p2o5 ?? 0) * dose / 100, 1)
      const aK2o  = num((item.k2o  ?? 0) * dose / 100, 1)
      sigN    += (item.n    ?? 0) * dose / 100
      sigP2o5 += (item.p2o5 ?? 0) * dose / 100
      sigK2o  += (item.k2o  ?? 0) * dose / 100
      fertRows.push({
        'Origen':                'Selección manual',
        'Combinación':           i + 1,
        'Fertilizante':          item.nombre ?? 'Producto personalizado',
        '% N':                   num(item.n,    1),
        '% P₂O₅':               num(item.p2o5, 1),
        '% K₂O':                num(item.k2o,  1),
        'Dosis (kg/ha)':         num(dose, 0),
        'N aportado (kg/ha)':    aN,
        'P₂O₅ aportado (kg/ha)':aP2o5,
        'K₂O aportado (kg/ha)': aK2o,
        'Fecha aplicación':      item.fechaAplicacion ?? null,
        'ΣN (kg/ha)':            num(sigN,    1),
        'ΣP₂O₅ (kg/ha)':        num(sigP2o5, 1),
        'ΣK₂O (kg/ha)':         num(sigK2o,  1),
      })
    })
  }

  const wsFert = XLSX.utils.json_to_sheet(
    fertRows.length > 0 ? fertRows : [{ 'Info': 'No hay recomendaciones de fertilizantes disponibles.' }]
  )
  wsFert['!cols'] = [
    { wch: 24 }, // Origen
    { wch: 12 }, // Combinación
    { wch: 32 }, // Fertilizante
    { wch:  8 }, // % N
    { wch:  9 }, // % P₂O₅
    { wch:  9 }, // % K₂O
    { wch: 14 }, // Dosis
    { wch: 20 }, // N aportado
    { wch: 22 }, // P₂O₅ aportado
    { wch: 20 }, // K₂O aportado
    { wch: 16 }, // Fecha aplicación
    { wch: 14 }, // ΣN
    { wch: 16 }, // ΣP₂O₅
    { wch: 14 }, // ΣK₂O
  ]

  // ── Hoja 3: Notas ───────────────────────────────────────────────────────
  const notas = [
    { 'Campo': 'Aplicación',         'Valor': 'FertiPRO' },
    { 'Campo': 'Motor de cálculo',   'Valor': 'FertiliCalc (Villalobos et al. 2020) vía API Sativum (ITACyL)' },
    { 'Campo': 'Fuente suelo',       'Valor': 'ArcGIS MapServer Sativum / ITACyL' },
    { 'Campo': 'Fuente recintos',    'Valor': 'SIGPAC (FEGA) · OGC API · CC BY 4.0' },
    { 'Campo': 'Fecha generación',   'Valor': new Date().toISOString() },
    { 'Campo': 'Unidades NPK',       'Valor': 'kg/ha — N en elemento puro; P y K en forma óxido (P₂O₅, K₂O)' },
    { 'Campo': 'Conversión P→P₂O₅', 'Valor': '× 2.2914' },
    { 'Campo': 'Conversión K→K₂O',  'Valor': '× 1.2046' },
    { 'Campo': 'N aportado riego',   'Valor': 'NO₃ (mg/L) × dotación (m³/ha) / 1000 × (14/62) = kg N/ha' },
    ...(asesor?.nombre || asesor?.regfer ? [
      { 'Campo': '', 'Valor': '' },
      { 'Campo': 'Asesor responsable', 'Valor': [asesor.nombre, asesor.apellidos].filter(Boolean).join(' ') || '' },
      ...(asesor.regfer   ? [{ 'Campo': 'Nº REGFER',        'Valor': asesor.regfer }]   : []),
      ...(asesor.nif      ? [{ 'Campo': 'NIF asesor',        'Valor': asesor.nif }]      : []),
      ...(asesor.telefono ? [{ 'Campo': 'Teléfono asesor',   'Valor': asesor.telefono }] : []),
      ...(asesor.email    ? [{ 'Campo': 'Email asesor',      'Valor': asesor.email }]    : []),
    ] : []),
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
