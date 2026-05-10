# FertiPRO

Simulador de cálculo de necesidades de nutrientes para cultivos agrícolas. Para cada hoja de cultivo, FertiPRO calcula las necesidades de fertilización en función de cuatro entradas:

1. Extracciones del cultivo (catálogo propio de 157 cultivos en 7 categorías).
2. Análisis del suelo (capa Sativum / ITACyL).
3. Calidad del agua de riego.
4. Enmienda orgánica aportada.

La hoja de cultivo se construye sobre la unidad oficial: el recinto SIGPAC. El usuario puede dibujar un polígono libre, cargar un GeoJSON o shapefile, o agregar uno o varios recintos SIGPAC contiguos para componer su unidad de producción. El motor de cálculo opera sobre esa geometría.

## Estado

Versión 0.1.0 — fase inicial. Disponibles: selector de cultivo, mapa con SIGPAC, ficha de recinto, ficha de cultivo. En curso: capa SIGPAC interactiva (vectorial + ráster) y motor de cálculo completo.

Producción: <https://fertipro.vercel.app/>

## Stack

- Vite 5 + React 18
- Leaflet 1.9 + `@geoman-io/leaflet-geoman-free` para dibujo y edición de geometrías
- `@turf/area`, `@turf/centroid`, `@turf/helpers` para geoprocesamiento en cliente
- `jszip` para import/export de shapefiles en navegador
- Vercel Functions (`/api/*`) para los proxies CORS

## Arranque local

```bash
npm install
npm run dev
```

Las llamadas a `/api/*` se redirigen automáticamente al deploy de producción mediante el proxy de Vite (configurado en `vite.config.js`). **No es necesario Vercel CLI.** El frontend funciona idéntico en local y en producción sin cambios de código.

Para producción:

```bash
git push
```

Vercel redespliega en 2-3 minutos.

## Estructura

```
fertipro/
├── api/                          Funciones serverless Vercel
│   ├── sigpac.js                   proxy SIGPAC OGC API + MVT (recinto en un punto)
│   ├── sigpac-bbox.js              proxy SIGPAC para bbox de polígono
│   └── sativum.js                  proxy ArcGIS REST identify de Sativum/ITACyL
├── public/
│   └── data/
│       └── extracciones_fertipro.json   Catálogo de extracciones por cultivo
├── src/
│   ├── api/                      Wrappers cliente de las funciones serverless
│   ├── calculo/                  Motor de cálculo de necesidades de nutrientes
│   ├── components/               UI: tarjetas SIGPAC y geometría
│   ├── cultivos/                 Selector y ficha de cultivo
│   ├── data/                     Acceso al JSON de extracciones
│   ├── map/                      MapPicker (Leaflet + Geoman)
│   └── utils/                    Geometría, exportación GeoJSON/SHP
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Catálogo de cultivos

`public/data/extracciones_fertipro.json` contiene 157 cultivos clasificados en 7 categorías. Cada registro define:

- Categoría y familia botánica.
- Indicador `n_fijado` (24 cultivos fijadores de N: leguminosas y forrajeras Fabaceae).
- Parámetros agronómicos: materia seca, índice de cosecha, residuos, β y EF en frutales.
- Composición de nutrientes (N, P, K, Ca, Mg, S, Fe, Cu, Mn, Zn, B, Mo) tanto de la parte comercial como de la parte no comercial.
- Auditoría: fechas de alta, modificación y baja.

Convención: `null` significa "no determinado" (distinto de cero).

## Fuentes de datos cartográficos

| Capa | Endpoint | Licencia |
|------|----------|----------|
| Recintos SIGPAC (geometría + atributos) | `https://sigpac-hubcloud.es/ogcapi/collections/recintos/items` | CC BY 4.0 HVD SIGC (FEGA) |
| Recintos SIGPAC (uso y vectorial cliente) | `https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/{z}/{x}/{y}.geojson` | CC BY 4.0 HVD SIGC (FEGA) |
| Sativum / ITACyL (suelo, clima) | `https://gateway.api.itacyl.es/sativumarcgis/MapServer/identify` | ITACyL — JCYL |
| Ortofoto base | `https://tms-pnoa-ma.idee.es` (PNOA Máxima Actualidad) | IGN |

## Variables de entorno

Configuradas en el proyecto Vercel (no en `.env.local`):

- `SATIVUM_API_KEY` — apikey de la pasarela ITACyL para Sativum.
- `SATIVUM_BASE_URL` — opcional, por defecto `https://gateway.api.itacyl.es/sativumarcgis`.

SIGPAC HubCloud no requiere apikey: los endpoints son públicos.

## Atribución

Los datos cartográficos de recintos del SIGPAC son datos de Alto Valor (HVD) distribuidos bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es) por el FEGA — Ministerio de Agricultura, Pesca y Alimentación.
