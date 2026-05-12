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
