/**
 * api/sativum-group.js — esqueleto :group-crop-units (solo validación de despliegue)
 *
 * SIN lógica de agrupación todavía — valida método y devuelve un eco
 * controlado, para confirmar que Vercel despliega este fichero como
 * función serverless en el preview de esta rama.
 *
 * URL de momento (routing por fichero, sin rewrite todavía): POST /api/sativum-group
 * URL objetivo final (API STD, pendiente de rewrite en vercel.json):
 *   POST /v1/sativum/crop-units:group-crop-units
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      correlationId: null,
      httpStatusInfo: '405 METHOD_NOT_ALLOWED',
      key: 'METHOD_NOT_ALLOWED',
      message: 'Método no permitido. Usa POST.',
      formattedMessage: 'Método no permitido. Usa POST.',
      params: {},
      details: [],
    })
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    stub: true,
    message: 'Esqueleto de :group-crop-units desplegado — todavía sin lógica de agrupación.',
    receivedBody: req.body ?? null,
  })
}
