/**
 * src/utils/importExcel.js
 *
 * Parsea un fichero Excel generado por exportarPlanAbonado() y devuelve
 * un objeto con el estado de la app listo para hidratar los useState.
 *
 * Campos que RESTAURA:
 *   fecha, fechaInicioCiclo, fechaFinCiclo
 *   asesor
 *   calculo (strategy, cropYield, tillage, recogeResiduos, quemaResiduos)
 *   suelo   (soilType, organicMatter, ph, pOlsen, kSoil)
 *   cec
 *   analisisPropio, refAnalisisSuelo, sueloPersonalizado
 *   riego   (sistemaExplotacion, fuenteId, refAnalisisAgua, dotacionM3, no3MgL, pMgL, kMgL)
 *   planItems
 *   mediasGEI   (array de codigoSiex)
 *   cultivoId, cultivoName  (solo para mostrar en el aviso — el cultivo debe reseleccionarse)
 *
 * Campos que NO restaura (requieren interacción del usuario):
 *   cultivo     — el usuario debe reseleccionar desde el combobox
 *   point/recinto/recintos — el usuario debe cargar la geometría en el mapa
 *   resultados (npk) — se recalculan tras seleccionar el cultivo
 *
 * Requisito de formato: el fichero debe tener la hoja "Plan de Abonado"
 * tal y como la genera exportarPlanAbonado().
 */
import { FUENTES_AGUA } from '../data/sativum/fuentesAgua'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convierte una fecha en formato español ("DD/MM/YYYY") a "YYYY-MM-DD".
 * Devuelve '' si el string no es reconocible.
 */
function parseFechaES(str) {
  if (str == null || str === '' || str === '—') return ''
  const s = String(str).trim()
  const parts = s.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts
  if (!d || !m || !y) return ''
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Extrae el código de textura Sativum de un label como "Franca (LOAM)" → "LOAM".
 */
function parseSoilTypeKey(label) {
  if (!label) return null
  const m = String(label).match(/\(([A-Z_]+)\)\s*$/)
  return m ? m[1] : null
}

/**
 * Extrae el codigoSiex de una cadena tipo "Cod. SIEX 7" → 7
 */
function parseMedidaGEI(campo) {
  const m = String(campo).match(/Cod\.\s*SIEX\s+(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * Convierte un valor a número o devuelve null si no es parseable.
 */
function toNum(v) {
  if (v == null || v === '' || v === '—') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

/**
 * Convierte un valor a string limpio o '' si es null/—.
 */
function toStr(v) {
  if (v == null || v === '—') return ''
  return String(v).trim()
}

// ─── Estrategia ───────────────────────────────────────────────────────────────
// IDs válidos tal como los usa Sativum
const VALID_STRATEGY_IDS = new Set(['SUFFICIENCY', 'REDUCED', 'MAINTENANCE', 'MAXIMUM'])

// Mapa inverso label → ID (para Excel exportados antes de la sesión 19)
// Nota: si hay discrepancia de encoding entre el export y este mapa, el import
// cae en el fallback 'MAINTENANCE'. Por eso el export ahora incluye 'Estrategia ID'.
const ESTRATEGIA_REVERSE = {
  'Estrategia de suficiencia (mínimo fertilizante)':  'SUFFICIENCY',
  'Acumulación y mantenimiento (abono reducido)':      'REDUCED',
  'Mantenimiento (análisis de suelo no disponible)':   'MAINTENANCE',
  'Acumulación y mantenimiento (máximo rendimiento)':  'MAXIMUM',
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * @param {File} file — fichero .xlsx seleccionado por el usuario
 * @returns {Promise<object>} — estado restaurado listo para hidratar la app
 */
export async function importarPlanDesdeExcel(file) {
  const mod  = await import('xlsx')
  const XLSX = mod.default ?? mod

  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array' })

  // ── Hoja 1: Plan de Abonado ─────────────────────────────────────────────
  const ws1 = wb.Sheets['Plan de Abonado']
  if (!ws1) throw new Error('Hoja "Plan de Abonado" no encontrada. ¿Es un plan exportado por FertiPRO?')

  // Leer filas como arrays [Campo, Valor, Unidad]
  const planRows = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: null })

  // Construir mapa Campo → Valor; recoger mediasGEI por separado
  const campos     = {}
  const mediasGEI  = []
  for (let i = 1; i < planRows.length; i++) {
    const row   = planRows[i]
    const campo = row[0] != null ? String(row[0]).trim() : ''
    const valor = row[1]

    if (!campo) continue                              // fila spacer
    if (valor === '—' || valor === null) continue    // campo vacío / no aplicable

    // Medidas GEI: "Cod. SIEX 7" → extrae el código
    if (campo.startsWith('Cod.') && campo.includes('SIEX')) {
      const code = parseMedidaGEI(campo)
      if (code != null) mediasGEI.push(code)
      continue
    }

    campos[campo] = valor
  }

  // ── Hoja 2: Fertilizantes ───────────────────────────────────────────────
  const ws2      = wb.Sheets['Fertilizantes']
  const planItems = []

  if (ws2) {
    const fertRows = XLSX.utils.sheet_to_json(ws2, { defval: null })
    for (const r of fertRows) {
      const nombre = r['Fertilizante']
      // Saltar la fila placeholder "no hay recomendaciones"
      if (!nombre || String(nombre).startsWith('No hay recomendaciones')) continue

      const origenRaw = r['Origen']
      const origen    = origenRaw === 'Propuesta Sativum' ? 'sativum' : 'manual'
      // Detectar fertilizante orgánico con mineralización anual.
      // (a) Comparación directa del valor exportado 'Sí'
      // (b) Fallback: si 'Año 0 (%)' tiene datos numéricos, el item es orgánico
      //     (robusto ante problemas de encoding con la 'í' de 'Sí')
      const orgEfAnualRaw = r['Org. (ef. anual)']
      const hasYearPctData = toNum(r['Año 0 (%)']) != null || toNum(r['Año 1 (%)']) != null
      const appliesAnnualEffectiveness =
        (orgEfAnualRaw != null && String(orgEfAnualRaw).trim() !== '' &&
          String(orgEfAnualRaw).trim() !== '0') ||
        hasYearPctData

      // fecha: puede ser string 'YYYY-MM-DD' o número serial Excel
      let fechaAplicacion = null
      const fechaRaw = r['Fecha aplicación']
      if (fechaRaw != null) {
        if (typeof fechaRaw === 'string') {
          fechaAplicacion = fechaRaw
        } else if (typeof fechaRaw === 'number') {
          // Serial de Excel → Date → ISO
          const d = XLSX.SSF.parse_date_code(fechaRaw)
          if (d) {
            fechaAplicacion = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
          }
        }
      }

      planItems.push({
        id:          Date.now() + Math.random(),
        origen,
        nombre:      toStr(nombre) || 'Producto personalizado',
        tipo:        null,
        tipoSIEX:    r['Tipo SIEX'] != null ? toStr(r['Tipo SIEX']) : null,
        n:           toNum(r['% N'])    ?? 0,
        p2o5:        toNum(r['% P₂O₅']) ?? 0,
        k2o:         toNum(r['% K₂O'])  ?? 0,
        cantidad:    toNum(r['Dosis (kg/ha)']) ?? 0,
        fechaAplicacion,
        esPersonalizado:          false,  // no se puede determinar desde el export
        appliesAnnualEffectiveness,
        yearPercent0: toNum(r['Año 0 (%)']),
        yearPercent1: toNum(r['Año 1 (%)']),
        yearPercent2: toNum(r['Año 2 (%)']),
      })
    }
  }

  // ── Reconstruir estado de la app ────────────────────────────────────────

  // Fechas
  const fecha            = parseFechaES(campos['Fecha'])            || new Date().toISOString().slice(0, 10)
  const fechaInicioCiclo = parseFechaES(campos['Inicio de ciclo'])  || ''
  const fechaFinCiclo    = parseFechaES(campos['Fin de ciclo'])     || ''

  // Asesor
  const asesor = {
    regfer:    toStr(campos['Nº REGFER']),
    nombre:    '',
    apellidos: '',
    nif:       toStr(campos['NIF asesor']),
    telefono:  toStr(campos['Teléfono asesor']),
    email:     toStr(campos['Email asesor']),
  }
  const nombreCompleto = campos['Asesor responsable del plan']
  if (nombreCompleto) {
    const parts      = String(nombreCompleto).trim().split(' ')
    asesor.nombre    = parts[0] ?? ''
    asesor.apellidos = parts.slice(1).join(' ')
  }

  // ─── Cultivo actual ────────────────────────────────────────────────────────
  const cultivoName = campos['Cultivo'] ? String(campos['Cultivo']) : null
  const cultivoId   = toNum(campos['Cultivo ID Sativum'])

  // Reconstruir el objeto cultivo a partir de los campos guardados en el Excel
  // (disponibles solo en Excels generados a partir de la sesión 19).
  // Sin estos campos, cultivo = null y el usuario debe reseleccionar.
  const cultivoPSG = toStr(campos['Cultivo plantSpeciesGroup'])
  const cultivo = (cultivoName && cultivoPSG) ? {
    id:               cultivoId,
    name:             cultivoName,
    plantSpeciesGroup: cultivoPSG,
    yieldMedium:      toNum(campos['Cultivo yieldMedium']),
    nfixCode:         Number(toStr(campos['Cultivo nfixCode']) || '0'),
    cv:               toNum(campos['Cultivo cv']) ?? 0,
    irrigation:       toNum(campos['Cultivo irrigation']) ?? 0,
  } : null

  // ─── Cultivo anterior ──────────────────────────────────────────────────────
  const cultivoAnteriorName = campos['Cultivo precedente'] ? String(campos['Cultivo precedente']) : null
  const cultivoAnteriorPSG  = toStr(campos['Cultivo precedente plantSpeciesGroup'])
  const cultivoAnterior = (cultivoAnteriorName && cultivoAnteriorPSG) ? {
    id:               toNum(campos['Cultivo precedente ID']),
    name:             cultivoAnteriorName,
    plantSpeciesGroup: cultivoAnteriorPSG,
    yieldMedium:      toNum(campos['Cultivo precedente yieldMedium']),
    nfixCode:         Number(toStr(campos['Cultivo precedente nfixCode']) || '0'),
    cv:               toNum(campos['Cultivo precedente cv']) ?? 0,
    irrigation:       0,
  } : null

  // Parámetros del cultivo anterior (siempre se devuelven si hay nombre, aunque
  // no haya el objeto completo, para no perder los datos de la rotación)
  const cultivoAnteriorParams = cultivoAnteriorName ? {
    cropYield:      toNum(campos['Rendimiento precedente']),
    laboreo:        campos['Laboreo tras cosecha'] === 'Sí',
    recogeResiduos: campos['Residuos precedente'] === 'Recogidos',
    quemaResiduos:  campos['Quema residuos precedente'] === 'Sí',
  } : null

  // ─── Estrategia ────────────────────────────────────────────────────────────
  // Prioridad: (1) campo 'Estrategia ID' (ID crudo, disponible sesión 19+)
  //            (2) campo 'Estrategia' si ya contiene un ID crudo (formato pre-sesión 17)
  //            (3) ESTRATEGIA_REVERSE (label → ID, para sesión 17-18)
  //            (4) fallback MAINTENANCE
  const estrategiaIdCrudo  = toStr(campos['Estrategia ID'])
  const estrategiaLabel    = campos['Estrategia'] ? String(campos['Estrategia']).trim() : null
  const strategy =
    (estrategiaIdCrudo && VALID_STRATEGY_IDS.has(estrategiaIdCrudo) ? estrategiaIdCrudo : null) ??
    (estrategiaLabel   && VALID_STRATEGY_IDS.has(estrategiaLabel)   ? estrategiaLabel   : null) ??
    ESTRATEGIA_REVERSE[estrategiaLabel] ??
    'MAINTENANCE'

  const calculo = {
    strategy,
    tillage:        campos['Laboreo'] === 'Sí',
    cropYield:      toNum(campos['Rendimiento objetivo']),
    recogeResiduos: campos['Residuos recogidos'] === 'Sí',
    quemaResiduos:  campos['Quema residuos'] === 'Sí',
    abonoVerde:     false,
    nEcuacion:      {},
    algoOverrides:  {},
  }

  // Suelo
  const analisisPropio   = campos['Fuente datos suelo'] === 'Laboratorio propio'
  const refAnalisisSuelo = toStr(campos['Ref. boletín análisis suelo'])
  const soilTypeKey      = parseSoilTypeKey(campos['Textura suelo'])

  const sueloImportado = {
    soilType:      soilTypeKey ?? 'LOAM',
    organicMatter: toNum(campos['Materia orgánica']),
    ph:            toNum(campos['pH']),
    pOlsen:        toNum(campos['P Olsen']),
    kSoil:         toNum(campos['K suelo']),
  }
  // sueloPersonalizado: solo cuando el plan se generó con análisis propio
  const sueloPersonalizado = analisisPropio ? { ...sueloImportado } : {}

  // CEC: usar el valor exportado (puede diferir del default por textura si el usuario lo ajustó)
  const cec = toNum(campos['CEC']) ?? 220

  // Riego
  const sistemaExplotacion = campos['Sistema de explotación'] === 'Regadío' ? 'regadio' : 'secano'
  const fuenteLabelRaw     = campos['Origen del agua (SIEX)']
  const fuenteEntry        = FUENTES_AGUA.find(f => f.label === fuenteLabelRaw)
  const fuenteId           = fuenteEntry?.id ?? (sistemaExplotacion === 'regadio' ? 1 : 0)

  const riego = {
    sistemaExplotacion,
    fuenteId,
    refAnalisisAgua: toStr(campos['Ref. análisis agua']),
    dotacionM3:      campos['Dotación riego']   != null ? String(toNum(campos['Dotación riego'])   ?? '') : '',
    no3MgL:          campos['NO₃ agua riego']   != null ? String(toNum(campos['NO₃ agua riego'])   ?? '') : '',
    pMgL:            campos['P agua riego']     != null ? String(toNum(campos['P agua riego'])     ?? '') : '',
    kMgL:            campos['K agua riego']     != null ? String(toNum(campos['K agua riego'])     ?? '') : '',
  }

  return {
    // Cultivo actual — stub (null si el Excel no tiene campos completos).
    // handleImportarPlan reemplaza el stub con el objeto completo de la API.
    cultivo,
    cultivoId,
    cultivoName,

    // Cultivo anterior — stub + nombre (para buscar en API) + params de rotación
    cultivoAnterior,
    cultivoAnteriorName,   // nombre solo; necesario cuando stub es null (Excel antiguo)
    cultivoAnteriorParams,

    // fechas
    fecha,
    fechaInicioCiclo,
    fechaFinCiclo,

    // asesor
    asesor,

    // calculo
    calculo,

    // suelo
    // Nota: si analisisPropio=false, se devuelve el suelo ArcGIS importado para que la app
    // pueda calcular sin necesidad de recargar la geometría. Cuando el usuario cargue la
    // geometría, setSuelo() lo sobreescribirá con datos frescos de ArcGIS.
    suelo: sueloImportado,
    sueloPersonalizado,
    analisisPropio,
    refAnalisisSuelo,
    cec,

    // riego
    riego,

    // plan de aplicaciones
    planItems,

    // medidas GEI
    mediasGEI,
  }
}
