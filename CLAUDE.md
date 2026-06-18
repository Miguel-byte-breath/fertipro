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
  api/
    sativum-algo.js          — ensamblarPayloadAlgo + calcularNPK + calcularNAgua
    sativum-fertilizers.js   — getRecomendacion, pToOxide, kToOxide
    sigpac.js                — getSigpacRecinto
    sativum-suelo.js         — identifySativum, normalizarSuelo
  components/
    ResultadosCard.jsx       — display NPK + combinaciones fertilizantes
    SueloCard.jsx            — análisis suelo ArcGIS + agua de riego (NO₃/P/K/dotación)
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
    exportPdf.js             — exportarPlanAbonadoPdf (jsPDF + AutoTable)
    recintosInterseccion.js  — interseccionRecintos(feature) → lista recintos con sup/pct
    geometry.js              — centroide, exportarGeoJSON, exportarSHP, etc.
api/
  sativum-algo.js            — proxy POST /fertilicalc/algo/
  sativum-fertilizers.js     — proxy GET+POST /nutrients/fertilizers (lista, detalle, recomendación)
  sativum-crops.js           — proxy GET /nutrients/crops
  sigpac-punto.js            — proxy SIGPAC OGC punto
  sigpac-bbox.js             — proxy SIGPAC OGC bbox (usado por interseccionRecintos)
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
3. Llama `exportarPlanAbonadoPdf({ cultivo, recintos, supTotalHa, npk, recomendacion, ... })`

`exportPdf.js` genera:
- Cabecera: logo `public/fertipro.png` + créditos motor
- Metadatos: cultivo actual/anterior, refs SIGPAC formato `PP-MM-AA-ZZ-PPP-PPP-R`, fecha
- Recuadro NPK: 5 círculos (N · P₂O₅ · P · K₂O · K) + superficie parcela
- Tabla FERTILIZANTES: fila agua de riego + todas las opciones de `/recommendation` agrupadas
- Pie: paginación `X/N` + fecha generación

**Pendiente en PDF:** tabla de recintos SIGPAC con superficie intersectada (ver Backlog #1).

## Flujo exportación Excel

`handleExportarPlan` en App.jsx pasa actualmente solo `recinto` (punto). **Pendiente** refactorizar igual que el PDF para pasar lista intersectada completa (Backlog #1).

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

## Backlog

### Activo

1. **Recintos SIGPAC en Excel y PDF** — Mostrar superficie intersectada por recinto.
   - *Excel:* refactorizar `handleExportarPlan` para calcular `interseccionRecintos()` (igual que ya hace `handleExportarPlanPdf`); pasar `recintos` + `supTotalHa` a `exportarPlanAbonado()`; añadir hoja "Recintos SIGPAC" con ref/uso/sup_recinto/sup_intersección/pct_ocupado.
   - *PDF:* añadir tabla de recintos tras el bloque NPK con las mismas columnas. Los datos ya llegan en el parámetro `recintos` de `exportarPlanAbonadoPdf`.

2. **Fechas de ciclo del cultivo** — Inputs de fecha inicio y fin de ciclo justo debajo de la fecha del plan en el panel lateral. Incluir en Excel (Hoja 1) y PDF (metadatos). Pendiente confirmar si la API Sativum devuelve estas fechas por cultivo o son siempre manuales.

3. **ZVN — Zonas Vulnerables a Nitratos** — Comprobar intersección de la/s geometría/s con la capa ZVN del OGC API SIGPAC (FEGA HubCloud). Badge de aviso en UI (ResultadosCard) + bloque de alerta en PDF. Relevante para RD 1051/2022. Requiere nuevo proxy `/api/sigpac-zvn.js` + turf.intersect. Investigar endpoint exacto en FEGA.

4. **Selección manual de fertilizantes del catálogo** — Además de las 5 mejores propuestas automáticas, permitir que el asesor/productor añada su propia combinación seleccionando del catálogo Sativum (1.253 productos). Prerequisito técnico: activar forward de query params en `api/sativum-fertilizers.js` GET lista.

### En espera

5. **CEC dinámico** — Cuando ITACyL publique capa ArcGIS de CEC, reemplazar valores por textura por dato real.

### Ideas futuras

6. **Proxy catálogo fertilizantes** — `api/sativum-fertilizers.js` GET lista: forward query params al upstream para filtrado/paginación. Prerequisito del ítem 4.
