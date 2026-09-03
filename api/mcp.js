/**
 * api/mcp.js — Servidor MCP ligero de Sativum
 *
 * Expone como "tools" de MCP la misma lógica de negocio que ya sirven los
 * tres endpoints HTTP :calculate-npk, :group-crop-units y :export-report —
 * SIN tocar ni duplicar esos ficheros. Cada tool invoca internamente al
 * handler correspondiente simulando una petición POST en memoria (mismo
 * req.body de entrada, misma respuesta res.status().json()/.send() de
 * salida que ya usa Vercel) — así el contrato de cada endpoint, ya cerrado
 * y probado en producción, no cambia ni se reimplementa. Cero riesgo sobre
 * ese código.
 *
 * Transporte: Streamable HTTP en modo *stateless* (sessionIdGenerator:
 * undefined) — necesario porque Vercel serverless no mantiene un proceso
 * persistente entre peticiones (stdio no es viable aquí). Se crea una
 * instancia nueva de McpServer + transporte en cada petición: patrón
 * recomendado por el propio SDK para despliegues stateless/serverless (ver
 * ejemplo oficial "simpleStatelessStreamableHttp" del paquete).
 *
 * URL: /api/mcp (ruta automática de Vercel para este fichero) — no sigue
 * el patrón ADR-0012 de "custom method" porque no es una acción REST, es
 * un único punto de entrada que habla JSON-RPC (protocolo MCP).
 *
 * Autenticación: NINGUNA por ahora (2-sep-2026, decisión explícita de
 * Miguel) — igual que los tres endpoints que envuelve. Si en el futuro
 * hace falta cerrarlo, puede hacerse SOLO aquí (comprobando p.ej. una
 * cabecera antes de crear el transporte, al principio del handler de más
 * abajo) sin afectar a la web pública ni a los tres endpoints HTTP, que
 * seguirían abiertos (requisito ITACyL de herramienta pública) — este
 * fichero es independiente de esas rutas.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import calculateNpkHandler from './sativum-plan.js'
import groupCropUnitsHandler from './sativum-group.js'
import exportReportHandler from './sativum-report.js'

// ---------------------------------------------------------------------
// invocarHandler: llama a un handler de Vercel (req, res) => void con un
// body dado, simulando una petición POST en memoria, y devuelve lo que ese
// handler hubiera respondido — sin pasar por red y sin tocar su fichero.
// ---------------------------------------------------------------------
function invocarHandler(handler, body) {
  return new Promise((resolve, reject) => {
    let resuelto = false
    const req = { method: 'POST', body }
    const res = {
      _status: 200,
      setHeader() {}, // los headers HTTP no aplican dentro del MCP
      status(code) {
        this._status = code
        return this
      },
      json(data) {
        if (!resuelto) {
          resuelto = true
          resolve({ status: this._status, json: data })
        }
      },
      send(data) {
        if (!resuelto) {
          resuelto = true
          resolve({ status: this._status, buffer: data })
        }
      },
    }
    Promise.resolve(handler(req, res)).catch((err) => {
      if (!resuelto) {
        resuelto = true
        reject(err)
      }
    })
  })
}

// Traduce la respuesta ya capturada del handler a contenido de tool MCP.
// Si el handler respondió con error (4xx/5xx), se marca isError con el
// mismo envelope §8 que vería un cliente HTTP normal — nada nuevo.
function resultadoJson({ status, json }) {
  return {
    isError: status >= 400,
    content: [{ type: 'text', text: JSON.stringify(json, null, 2) }],
  }
}

// Igual que resultadoJson, pero para el caso binario de :export-report: si
// hay error va como texto (envelope §8); si hay éxito, el buffer se envía
// como bloque `resource` en base64 (spec MCP), tal como estaba diseñado.
function resultadoArchivo({ status, json, buffer }, { uri, mimeType }) {
  if (status >= 400) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(json, null, 2) }],
    }
  }
  return {
    content: [
      {
        type: 'resource',
        resource: { uri, mimeType, blob: buffer.toString('base64') },
      },
    ],
  }
}

// ---------------------------------------------------------------------
// Definición del servidor MCP y sus 3 tools. Los inputSchema son
// deliberadamente permisivos (z.record(z.any()) en los objetos anidados):
// la validación de negocio de verdad ya vive en cada handler (BLOCKED por
// item, envelope §8, etc.) — el schema aquí solo documenta la forma
// esperada para el agente, no duplica esa validación.
// ---------------------------------------------------------------------
function crearServidor() {
  const server = new McpServer({ name: 'fertipro-sativum', version: '1.0.0' })

  // ---- calculate_npk — misma entrada/salida que POST :calculate-npk ----
  server.registerTool(
    'calculate_npk',
    {
      title: 'Calcular NPK (Sativum)',
      description:
        'Calcula el balance de N/P2O5/K2O (bruto y neto de riego) para un lote de unidades ' +
        'de cultivo, vía el motor ITACyL/Sativum. Cada item del lote devuelve su propio ' +
        'status ("OK" o "BLOCKED") con warnings — no hace falta que todos los items estén ' +
        'completos para poder calcular los demás.',
      inputSchema: {
        items: z
          .array(z.record(z.any()))
          .describe(
            'Lote de unidades a calcular. Cada item: { currentCrop:{crop,targetYield?,cv?,...}, ' +
              'precedingCrop?, soil:{soilType,cec,pOlsen|arcgisPOlsen,kSoil|arcgisKSoil,...}, ' +
              'water?, strategy?, advancedOverrides? } — mismo contrato que ' +
              'POST /v1/sativum/fertilization-plans:calculate-npk.',
          ),
        pageIndex: z.number().int().min(0).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ items, pageIndex, pageSize }) => {
      const r = await invocarHandler(calculateNpkHandler, { items, pageIndex, pageSize })
      return resultadoJson(r)
    },
  )

  // ---- group_crop_units — misma entrada/salida que POST :group-crop-units ----
  server.registerTool(
    'group_crop_units',
    {
      title: 'Agrupar unidades de cultivo (Sativum)',
      description:
        'Agrupa Unidades de Cultivo de Visual (obtenidas antes con getCropUnits, listas ' +
        '["varieties","persons","sigpac"]) en planes de abonado por titular — sin calcular ' +
        'NPK. No llama a Visual: recibe las UC ya leídas por el agente.',
      inputSchema: {
        cropUnits: z
          .array(z.record(z.any()))
          .describe('UCs de Visual tal cual las devuelve getCropUnits.'),
        pageIndex: z.number().int().min(0).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ cropUnits, pageIndex, pageSize }) => {
      const r = await invocarHandler(groupCropUnitsHandler, { cropUnits, pageIndex, pageSize })
      return resultadoJson(r)
    },
  )

  // ---- export_report — misma entrada que POST :export-report, salida en bloque resource ----
  server.registerTool(
    'export_report',
    {
      title: 'Exportar plan de abonado (Sativum)',
      description:
        'Genera el Excel del plan de abonado (mismo fichero que "Exportar Excel" en la web, ' +
        'reimportable en producción) y lo devuelve como recurso adjunto en base64. Campos ' +
        'obligatorios: cultivo y npk — mismo contrato que POST ' +
        '/v1/sativum/fertilization-plans:export-report.',
      inputSchema: {
        cultivo: z.record(z.any()).describe('Cultivo del plan (obligatorio).'),
        npk: z.record(z.any()).describe('Balance NPK del plan (obligatorio).'),
        suelo: z.record(z.any()).optional(),
        riego: z.record(z.any()).optional(),
        titular: z.record(z.any()).optional().describe('{ nifCif, ... } — para el nombre de fichero.'),
        nombrePlan: z.string().optional(),
        recintos: z
          .array(z.record(z.any()))
          .optional()
          .describe('Geometría WKT opcional, para la hoja "Recintos (WKT)".'),
        format: z.literal('xlsx').optional(),
      },
    },
    async (body) => {
      const r = await invocarHandler(exportReportHandler, body)
      return resultadoArchivo(r, {
        uri: 'sativum://export-report/plan-abonado.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    },
  )

  return server
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Método no permitido. El MCP solo acepta POST.' },
      id: null,
    })
    return
  }

  try {
    const server = crearServidor()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Error interno del servidor MCP.' },
        id: null,
      })
    }
  }
}
