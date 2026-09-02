/**
 * api/sativum-report.js — endpoint serverless :export-report
 *
 * URL definitiva (rewrite en vercel.json pospuesto a propósito, mismo patrón
 * con `:` escapado que :calculate-npk/:group-crop-units — hasta que haya
 * lógica real, ver CLAUDE.md):
 *   POST /v1/sativum/fertilization-plans:export-report → /api/sativum-report
 *
 * ESQUELETO — sin lógica real todavía. Solo valida método POST y hace eco del
 * body recibido, con el envelope de error §8 ya aplicado desde el primer
 * commit (mismo patrón usado para :calculate-npk). Objetivo de este primer
 * commit: validar el despliegue en preview de Vercel antes de escribir la
 * lógica real.
 *
 * Contrato ya cerrado (memoria del proyecto — no repetir el porqué aquí):
 *   - No es batch: un fichero por llamada.
 *   - Alcance v1: solo Excel — campo `format`, reservado, default 'xlsx'.
 *   - Respuesta real (pendiente de implementar): buffer del Excel directo en
 *     el body HTTP (nunca presigned URL), Content-Type
 *     application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
 *     Content-Disposition attachment.
 *   - Payload: mismo shape que construirWorkbookPlanAbonado() en
 *     src/utils/exportExcel.js — { point, recinto, recintos, cultivo, suelo,
 *     cec, riego, calculo, fecha, fechaInicioCiclo, fechaFinCiclo, npk,
 *     adjustedNutrient, cultivoAnterior, cultivoAnteriorParams, nombrePlan,
 *     titular, asesor, analisisPropio, refAnalisisSuelo, planItems,
 *     medidasGEI, recintosWkt, format, baseName } — la lógica real reutiliza
 *     esa función tal cual, sin duplicar la construcción del Excel.
 */

function correlationId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function sendError(res, { httpStatus, key, message, params = {}, details = [] }) {
  return res.status(httpStatus).json({
    correlationId: correlationId(),
    httpStatusInfo: { status: httpStatus },
    key,
    message,
    formattedMessage: message,
    params,
    details,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, {
      httpStatus: 405,
      key: 'METHOD_NOT_ALLOWED',
      message: 'Método no permitido. Usa POST.',
    })
  }

  // Esqueleto: sin validación de payload ni generación de Excel todavía —
  // solo confirma que el despliegue en preview de Vercel funciona, igual que
  // se hizo con el primer commit de :calculate-npk (api/sativum-plan.js).
  return res.status(200).json({
    stub: true,
    received: req.body ?? null,
  })
}
