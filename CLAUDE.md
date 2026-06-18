# FertiPRO × Sativum — CLAUDE.md

Briefing técnico para arrancar una sesión de trabajo sin contexto previo.

## Qué es esto

Aplicación web de planificación de abonado para agricultores españoles. Calcula necesidades NPK usando el motor FertiliCalc (Villalobos et al. 2020) a través de la API Sativum (ITACyL). Desplegada en Vercel (https://fertipro.vercel.app).

## Stack

- **Frontend:** Vite 5 + React 18, sin framework CSS
- **Mapa:** Leaflet + leaflet-geoman (dibujo de parcelas) + Turf (geometría)
- **Backend:** Vercel serverless functions en `/api/` (proxies a Sativum)
- **Exportación:** SheetJS (Excel) + jsPDF/jsPDF-AutoTable (PDF)
- **SIGPAC:** OGC API Features (FEGA HubCloud) para recintos

## Seguridad — regla inamovible

`SATIVUM_API_KEY` **nunca** al cliente, **nunca** hardcoded. Solo en variables de entorno Vercel, solo dentro de `/api/*.js`.

## Estructura relevante

```
src/
  App.jsx                    — raíz, estado global, handleCalcularNecesidades
                               handleExportarPlan (Excel) · handleExportarPlanPdf (PDF)
                               estado: recinto, suelo, cec, riego, calculo, resultados,
                                       fechaInicioCiclo, fechaFinCiclo
  api/
    sativum-algo.js          — ensamblarPayloadAlgo + calcularNPK + calcularNAgua
    sativum-fertilizers.js   — getRecomendacion, pToOxide, kToOxide
    sigpac.js                — getSigpacRecinto
    sativum-suelo.js         — identifySativum, normalizarSuelo
  components/
    ResultadosCard.jsx       — display NPK + combinaciones fertilizantes
    SueloCard.jsx            — análisis suelo ArcGIS + agua de riego (NO₃/P/K/dotación)
                               + Sistema de explotación (Secano/Regadío, derivado de fuenteId)
    EstrategiaPanel.jsx      — estrategia, laboreo, params N avanzados
    CultivoAnteriorPanel.jsx — cultivo precedente en la rotación
  cultivos/
    CultivoSelector.jsx      — combobox con búsqueda contra /nutrients/crops
  data/sativum/
    algoParams.js            — tabla efficiency_factor/p_threshold/k_threshold por estrategia×textura
    soilTypesSimpl.json      — mapeo pixel ArcGIS → SANDY/LOAM/CLAY_LOAM etc.
    fuentesAgua.js           — catálogo SIEX fuentes de agua (ids 0-6)
  utils/
    exportExcel.js           — exportarPlanAbonado + exportarRecintosSigpacExcel
                               acepta: fechaInicioCiclo, fechaFinCiclo
                               hoja "Recintos SIGPAC": uso_sigpac + coef_regadio incluidos
    exportPdf.js             — exportarPlanAbonadoPdf (jsPDF + AutoTable)
                               acepta: fechaInicioCiclo, fechaFinCiclo
    recintosInterseccion.js  — interseccionRecintos(feature) → lista recintos con sup/pct
                               _enrichConRecinfo() → enriquece uso_sigpac + coef_regadio en paralelo
    geometry.js              — centroide, exportarGeoJSON, exportarSHP, etc.
api/
  sativum-algo.js            — proxy POST /fertilicalc/algo/
  sativum-fertilizers.js     — proxy GET+POST /nutrients/fertilizers (lista, detalle, recomendación)
  sativum-crops.js           — proxy GET /nutrients/crops
  sigpac-punto.js            — proxy SIGPAC OGC punto
  sigpac-bbox.js             — proxy SIGPAC OGC bbox (usado por interseccionRecintos)
  sigpac-recinfo.js          — proxy REST recinfo: uso_sigpac, coef_regadio, superficie, pendiente
                               GET /api/sigpac-recinfo?pr=&mu=&po=&pa=&re=[&ag=&zo=]
```

## Flujo de cálculo (orden estricto)

1. `identifySativum(lon, lat)` → ArcGIS MapServer → `normalizarSuelo()` (MO, textura, pH, P Olsen, K suelo, NO₃ riego, K riego)
2. `calcularNPK(cultivosArr, suelo, opts)` → POST `/api/sativum-algo` → `recommendations.at(-1)` para el cultivo actual
3. Calcular `pRiego` y `kRiego` (mg/L × m³/ha / 1000) → restar de npkNorm.p/k → `npkParaRec`
4. `nRiego = calcularNAgua(no3MgL, dotacionM3)` — solo para display (el motor ya lo descuenta via `n_other`)
5. `getRecomendacion(npkParaRec, { adjustedNutrient })` → POST `/api/sativum-fertilizers`
6. Display: N bruto = `N_motor + nRiego`, P₂O₅/K₂O brutos directos del motor

## Flujo exportación PDF

`handleExportarPlanPdf` en App.jsx:
1. Llama `interseccionRecintos(feature)` para cada parcela activa → lista plana deduplicada de recintos
2. Suma superficie total (`@turf/area`) de las parcelas
3. Llama `exportarPlanAbonadoPdf({ cultivo, recintos, supTotalHa, npk, recomendacion, fechaInicioCiclo, fechaFinCiclo, ... })`

`exportPdf.js` genera:
- Cabecera: logo `public/fertipro.png` + créditos motor
- Metadatos: cultivo actual/anterior, refs SIGPAC formato `PP-MM-AA-ZZ-PPP-PPP-R`, fecha, inicio/fin de ciclo
- Recuadro NPK: 5 círculos (N · P₂O₅ · P · K₂O · K) + superficie parcela
- Tabla FERTILIZANTES: fila agua de riego + todas las opciones de `/recommendation` agrupadas
- Pie: paginación `X/N` + fecha generación

**Pendiente en PDF:** tabla de recintos SIGPAC con superficie intersectada (ver Backlog #3).

## Flujo exportación Excel

`handleExportarPlan` en App.jsx pasa actualmente solo `recinto` (punto). **Pendiente** refactorizar igual que el PDF para pasar lista intersectada completa (Backlog #3).

## SIGPAC HubCloud — endpoints y arquitectura

Base URL: `https://sigpac-hubcloud.es`

### OGC API Features (bbox, punto)
Usado por los proxies `sigpac-bbox.js` y `sigpac-punto.js`.  
**Problema conocido:** la OGC API devuelve `uso_sigpac` y `coef_regadio` vacíos para muchos recintos. No es fiable para estos campos.

### REST de consultas SIGPAC (recinfo, nitratos)
Servicio propio FEGA, más completo. Datos anuales (CC BY 4.0 HVD SIGC).

#### recinfo — datos del recinto
```
GET /servicioconsultassigpac/query/recinfo/{pr}/{mu}/{ag}/{zo}/{po}/{pa}/{re}.json
```
- `ag` y `zo` pueden ser `0` si no se conocen.
- Devuelve: `{ uso_sigpac, coef_regadio, superficie, pendiente_media, admisibilidad, region }`.
- **Proxy:** `api/sigpac-recinfo.js`.
- **Patrón de uso:** `_enrichConRecinfo()` en `recintosInterseccion.js` — llamadas paralelas con `Promise.allSettled`, aplicado en Caso A (SIGPAC intacta) y Caso B (bbox + turf). Si falla alguna, el recinto se devuelve sin modificar.

#### intersection nitratos — ZVN por recinto
```
GET /servicioconsultassigpac/intersection/nitratos/{pr}/{mu}/{ag}/{zo}/{po}/{pa}/{re}.json
```
- Devuelve `[{ surface_intersection: <m²>, surface_tpc: <float 0–100> }]`.
- Devuelve `[]` si el recinto **no** intersecta ninguna Zona Vulnerable a Nitratos (ZVN).
- **Pendiente:** proxy `api/sigpac-zvn.js` (Backlog #1).

### Parámetros de ruta SIGPAC
`pr`=provincia · `mu`=municipio · `ag`=agregado · `zo`=zona · `po`=polígono · `pa`=parcela · `re`=recinto  
Todos disponibles en el objeto `recinto` que devuelve `getSigpacRecinto()`.

## Reglas críticas de la API (bugs documentados)

| Código | Regla |
|--------|-------|
| B1 | `/fertilicalc/algo/` devuelve `Content-Type: text/html` → usar `JSON.parse(await res.text())` |
| B2 | Trailing slash obligatorio en `/fertilicalc/algo/` |
| B4 | `plant_species_group` en MAYÚSCULAS |
| B5 | `nfixCode` del catálogo es int (0/1); la API espera boolean |
| B7 | Cereales con fres=10 y no recoge paja → enviar `f_res: 100` |
| B8 | Conversiones antes de `/recommendation`: P×2.2914, K×1.2046 |
| B-npk | NPK puede no estar en top-level; normalizar: `npk?.n ?? recommendations.at(-1)?.n` |
| B-adj | Si N=0 (leguminosa cubre todo), auto-seleccionar adjustedNutrient por mayor UF |
| B-recom | `/recommendation` devuelve array `[{unique:[...ferts], observations:""}]`, no objeto |

## CEC por textura (valores Sativum)

`SANDY: 30 / SANDY_LOAM: 75 / LOAM: 100 / SILTY_LOAM: 80 / CLAY_LOAM: 220 / CLAY: 300` meq/kg  
Pendiente: cuando ITACyL publique capa ArcGIS de CEC, reemplazar por dato real.

## Validación alineada con Sativum (2026-06-17)

Patata 50.000 kg/ha, Brócoli anterior 5.900 kg/ha, agua riego otros orígenes 2.500 m³/ha:  
`N 190.3 · P₂O₅ 67.4 · P 29.4 · K₂O 269.0 · K 223.3`  
Cubierto por riego: `N 2.8 · P₂O₅ 1.7 · K₂O 28.6` — todo coincide con el PDF oficial Sativum ✅

## Comandos de desarrollo

```powershell
cd C:\work\fertipro-api-sativum
npm run dev          # Vite dev server (localhost:5173) — sin serverless functions
npx vercel dev       # Con serverless functions (requiere vercel login vigente)
npm run build        # Verificar build antes de push
git add .; git commit -m "..."; git push   # Despliegue a Vercel automático
```

**Nota PowerShell:** usar `;` como separador, no `&&`.  
**Nota vercel dev:** el token caduca. Si falla, ejecutar `npx vercel login` primero.  
**Nota edición archivos largos:** usar Python en `/tmp` para edits de archivos >100 líneas; verificar `tail -5` antes de dar el commit. Nunca sobreescribir archivos largos con Write directamente.  
**Git workflow:** Claude edita archivos, el usuario ejecuta todos los comandos git desde PowerShell.

## Commits recientes (2026-06-18)

```
8ee32a2 fix: exportPdf.js truncado — restaurar fechas ciclo sin cortar el archivo
09917a2 feat: fechas inicio/fin de ciclo en panel, Excel y PDF
ad8c2a3 feat: uso_sigpac + coef_regadio via servicio REST SIGPAC recinfo
ae490f8 fix: sistema de explotación en Excel y panel (encoding correcto)
ee41039 feat: añadir sistema de explotación (Secano/Regadío) en panel y Excel
```

## Backlog

### Activo

1. **ZVN — Zonas Vulnerables a Nitratos** — Comprobar si el `recinto` activo intersecta alguna ZVN (RD 1051/2022).
   - **Endpoint disponible:** `GET /servicioconsultassigpac/intersection/nitratos/{pr}/{mu}/{ag}/{zo}/{po}/{pa}/{re}.json`
   - Devuelve `[{ surface_intersection, surface_tpc }]` o `[]` si no hay intersección.
   - **Archivos a crear/tocar:**
     - `api/sigpac-zvn.js` — proxy nuevo (misma estructura que `sigpac-recinfo.js`)
     - `App.jsx` — estado `zvn`, llamar en `queryCoords` tras `setRecinto(rec)`
     - `src/components/ResultadosCard.jsx` — badge rojo "⚠ ZVN" si `zvn.enZvn`
     - `src/utils/exportPdf.js` — bloque de alerta amarillo en metadatos
   - El objeto `recinto` de `getSigpacRecinto()` tiene todos los campos necesarios: `provincia`, `municipio`, `agregado`, `zona`, `poligono`, `parcela`, `recinto`.

2. **Selección manual de fertilizantes del catálogo** — Además de las 5 mejores propuestas automáticas, permitir añadir combinación propia desde el catálogo Sativum (1.253 productos). Prerequisito: ítem 2a.
   - 2a. **Proxy catálogo fertilizantes** — `api/sativum-fertilizers.js` GET lista: forward query params al upstream para filtrado/paginación.

3. **Recintos SIGPAC en Excel y PDF** — Tabla de recintos con superficie intersectada.
   - *Excel:* refactorizar `handleExportarPlan` para calcular `interseccionRecintos()` (igual que `handleExportarPlanPdf`); la hoja "Recintos SIGPAC" ya existe con columnas uso/coef pero recibe solo el recinto de punto; añadir sup_recinto/sup_intersección/pct_ocupado.
   - *PDF:* añadir tabla de recintos tras el bloque NPK. Los datos ya llegan en `recintos` de `exportarPlanAbonadoPdf`.

### En espera

4. **CEC dinámico** — Cuando ITACyL publique capa ArcGIS de CEC, reemplazar valores por textura por dato real.

### Completados (2026-06-18)

- ✅ **Sistema de explotación** — Badge Secano/Regadío en `SueloCard.jsx` + fila en Excel, derivado de `riego.fuenteId`.
- ✅ **uso_sigpac + coef_regadio** — Proxy `api/sigpac-recinfo.js`; `_enrichConRecinfo()` enriquece todos los recintos (Caso A y B). Hoja "Recintos SIGPAC" en Excel incluye ambas columnas.
- ✅ **Fechas de ciclo** — `fechaInicioCiclo` / `fechaFinCiclo` en App.jsx, inputs de fecha en panel, incluidos en Excel y PDF.
