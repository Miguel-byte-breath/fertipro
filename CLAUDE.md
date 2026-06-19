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
  App.jsx                    — raíz, estado global
                               estado: recinto, suelo, cec, riego, calculo, resultados,
                                       fechaInicioCiclo, fechaFinCiclo,
                                       recintos (lista enriquecida), recintosLoading
                               handleCalcularNecesidades
                               handleExportarPlan (Excel) · handleExportarPlanPdf (PDF)
                               queryCoords({ lon, lat, feature? }) — punto o polígono
                               toRecintoItem(rec) — normaliza recinto-punto al formato lista
  api/
    sativum-algo.js          — ensamblarPayloadAlgo + calcularNPK + calcularNAgua
    sativum-fertilizers.js   — getRecomendacion, pToOxide, kToOxide, getFertilizadores
    sigpac.js                — getSigpacRecinto
    sativum-suelo.js         — identifySativum, normalizarSuelo
  components/
    ParcelaInfoCard.jsx      — tabla recintos SIGPAC (referencia, sup, uso, ZVN)
                               muestra badge "⚠ ZVN" y alerta si algún recinto en ZVN
                               se renderiza tanto para polígono como para punto
    ResultadosCard.jsx       — display NPK + "Opciones propuestas (API Sativum)"
    SueloCard.jsx            — análisis suelo ArcGIS + agua de riego + Sistema explotación
    EstrategiaPanel.jsx      — estrategia, laboreo, params N avanzados
    CultivoAnteriorPanel.jsx — cultivo precedente en la rotación
    AsesoramientoPanel.jsx   — panel colapsable datos asesor REGFER ✅
                               campos: nRegfer, nombre, apellidos, nif (req) + telefono, email (opt)
                               persiste en localStorage('fertipro_asesor')
                               auto-expande si localStorage ya tiene datos; badge con nombre si colapsado
                               props: asesor, onChange(obj)
    FertilizanteManualPanel.jsx — panel colapsable "Recomendación asesor" ✅
                               1º selector obligatorio: tipoSIEX (24 tipos RD 1051/2022)
                               carga lazy catálogo Sativum (1253 items) al primer open
                               filtro Fabricante + combobox búsqueda (debounce 300ms)
                               sentinel PERSONALIZADO (morado) → inputs N%/P2O5%/K2O%
                               esPersonalizado es derived (no state): productoSeleccionado?.esPersonalizado
                               tabla items con dosis, fecha, aporte NPK; badge tipoSIEX (morado/azul)
                               barras cobertura NPK acumulada vs. necesidad (verde ≥100% / ámbar ≥70% / rojo <70%)
                               fallback npm run dev: "Catálogo no disponible. Selecciona tipo SIEX + PERSONALIZADO"
                               props: fertilizadoresManuales, onChange, npk, nRiego, pRiego, kRiego
  cultivos/
    CultivoSelector.jsx      — combobox con búsqueda contra /nutrients/crops
  data/sativum/
    algoParams.js            — tabla efficiency_factor/p_threshold/k_threshold por estrategia×textura
    soilTypesSimpl.json      — mapeo pixel ArcGIS → SANDY/LOAM/CLAY_LOAM etc.
    fuentesAgua.js           — catálogo SIEX fuentes de agua (ids 0-6)
    tiposMaterialFertilizante.js — 24 tipos SIEX de material fertilizante ✅ (RD 1051/2022)
                               { codigo, nombre } — usado por FertilizanteManualPanel para PERSONALIZADO
  utils/
    exportExcel.js           — exportarPlanAbonado + exportarRecintosSigpacExcel
                               acepta: fechaInicioCiclo, fechaFinCiclo, recintos (con enZvn)
                               hoja "Recintos SIGPAC": uso_sigpac + coef_regadio + ZVN (S/N)
    exportPdf.js             — exportarPlanAbonadoPdf (jsPDF + AutoTable)
                               acepta: fechaInicioCiclo, fechaFinCiclo, recintos (con enZvn)
                               tabla recintos SIGPAC con columna ZVN (SI/NO, rojo si SI)
    recintosInterseccion.js  — interseccionRecintos(feature) → lista recintos enriquecidos
                               enrichRecintos(lista) → enriquece lista de recintos de punto
                               _enrichConRecinfo() → uso_sigpac, coef_regadio (paralelo)
                               _enrichConZvn()     → enZvn: bool (paralelo, no bloquea)
    geometry.js              — centroide, exportarGeoJSON, exportarSHP, etc.
api/
  sativum-algo.js            — proxy POST /fertilicalc/algo/
  sativum-fertilizers.js     — proxy GET+POST /nutrients/fertilizers (lista, detalle, recomendación)
  sativum-crops.js           — proxy GET /nutrients/crops
  sigpac-punto.js            — proxy SIGPAC OGC punto
  sigpac-bbox.js             — proxy SIGPAC OGC bbox (usado por interseccionRecintos)
  sigpac-recinfo.js          — proxy REST recinfo: uso_sigpac, coef_regadio, superficie, pendiente
                               GET /api/sigpac-recinfo?pr=&mu=&po=&pa=&re=[&ag=&zo=]
  sigpac-zvn.js              — proxy REST nitratos: comprueba ZVN por recinto
                               GET /api/sigpac-zvn?pr=&mu=&po=&pa=&re=[&ag=&zo=]
                               Devuelve [] (sin ZVN) o [{surface_intersection,surface_tpc}]
```

## Flujo de cálculo (orden estricto)

1. `identifySativum(lon, lat)` → ArcGIS MapServer → `normalizarSuelo()` (MO, textura, pH, P Olsen, K suelo, NO₃ riego, K riego)
2. `calcularNPK(cultivosArr, suelo, opts)` → POST `/api/sativum-algo` → `recommendations.at(-1)` para el cultivo actual
3. Calcular `pRiego` y `kRiego` (mg/L × m³/ha / 1000) → restar de npkNorm.p/k → `npkParaRec`
4. `nRiego = calcularNAgua(no3MgL, dotacionM3)` — solo para display (el motor ya lo descuenta via `n_other`)
5. `getRecomendacion(npkParaRec, { adjustedNutrient })` → POST `/api/sativum-fertilizers`
6. Display: N bruto = `N_motor + nRiego`, P₂O₅/K₂O brutos directos del motor

## Flujo de recintos SIGPAC (queryCoords)

```
queryCoords({ lon, lat, feature? })
  ├── getSigpacRecinto(lon, lat)        → rec (punto)
  ├── SI feature (polígono)
  │     interseccionRecintos(feature)   → lista recintos geométrica
  │       └── _enrichConRecinfo() → _enrichConZvn()
  └── SI solo punto
        enrichRecintos([toRecintoItem(rec)])
          └── _enrichConRecinfo() → _enrichConZvn()
→ setRecintos(recList) → ParcelaInfoCard renderiza tabla
```

## Flujo exportación PDF

`handleExportarPlanPdf` en App.jsx:
1. Usa `recintos` del estado (ya enriquecidos con ZVN)
2. Suma superficie total (`@turf/area`) de las parcelas activas
3. Llama `exportarPlanAbonadoPdf({ cultivo, recintos, supTotalHa, npk, recomendacion, fechaInicioCiclo, fechaFinCiclo, asesor, fertilizadoresManuales })`

`exportPdf.js` genera (secciones en orden):
1. Cabecera: logo `public/fertipro.png` + créditos motor
2. Metadatos: cultivo actual/anterior, fecha, inicio/fin ciclo  
   + si hay asesor: "Asesor responsable del plan: Nombre Apellidos | REGFER: XXX" + NIF
3. Tabla recintos SIGPAC: referencia PP-MM-AA-ZZ-PPP-PPP-R | Sup. (ha) | % | Uso | Coef.reg | ZVN  
   → celda ZVN="SI" en rojo si `r.enZvn`
4. Recuadro NPK: 5 círculos (N · P2O5 · P · K2O · K) + superficie parcela
5. Tabla "APORTE DEL AGUA DE RIEGO" (si riego activo): fuente | dotación/ha | dotación total | UF N | UF P2O5 | UF K2O
   → sección standalone con cabecera azul (40,100,140); se renderiza solo si fuenteId≠0 y dotación>0
6. Tabla "OPCIONES PROPUESTAS — API SATIVUM": columnas UF N / UF P2O5 / UF K2O (kg/ha)
7. Tabla "RECOMENDACIÓN DEL ASESOR" (si hay fertilizadoresManuales):
   columnas Fecha | Producto | Tipo | Dosis | N | P2O5 | K2O | N acum. | P2O5 acum. | K2O acum.
   fila TOTAL + fila cobertura %
8. Pie: paginación `X/N` + fecha generación

**⚠ jsPDF + Helvetica = WinAnsi only** — NO soporta Unicode: ₂ (U+2082), ₅ (U+2085), Σ (U+03A3).
Usar siempre equivalentes ASCII: P2O5, K2O, "N acum.", "P2O5 acum.", "K2O acum.".

## Flujo exportación Excel

`handleExportarPlan` en App.jsx — acepta `asesor`, `fertilizadoresManuales`:
- **Pendiente refactorizar:** actualmente pasa solo `recinto` (punto) → debe pasar lista `recintos` del estado
- Hoja principal y "Notas": filas con datos del asesor (si los hay)
- Hoja "Recintos SIGPAC": columnas uso_sigpac, coef_regadio, ZVN (S/N/null)
- Hoja "Fertilizantes": columna `Origen` distingue "Propuesta API Sativum" vs. manual
  sección manual incluye ΣN, ΣP₂O₅, ΣK₂O acumulados por fila

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

#### intersection nitratos — ZVN por recinto
```
GET /servicioconsultassigpac/intersection/nitratos/{pr}/{mu}/{ag}/{zo}/{po}/{pa}/{re}.json
```
- Devuelve `[{ surface_intersection: <m²>, surface_tpc: <float 0–100> }]` si hay ZVN.
- Devuelve `[]` si el recinto **no** intersecta ninguna ZVN.
- **Proxy:** `api/sigpac-zvn.js` ✅ implementado.

### Parámetros de ruta SIGPAC
`pr`=provincia · `mu`=municipio · `ag`=agregado · `zo`=zona · `po`=polígono · `pa`=parcela · `re`=recinto  
Todos disponibles en el objeto `recinto` que devuelve `getSigpacRecinto()`.

## Catálogo de fertilizantes Sativum — estructura

`GET /nutrients/fertilizers` devuelve array de 1253 items. Campos por item:
```json
{ "id": 0, "name": "05-08-18 de GENÉRICO", "type": "TERNARIO NPK",
  "n": 5, "p2o5": 8, "k2o": 18, "cao": 0, "links": [{"href":"..."}] }
```
- **`type`** — tipo químico: `"TERNARIO NPK"`, `"BINARIO PK"`, `"BINARIO NP"`, `"BINARIO NK"` (y más)
- **Fabricante** — NO existe como campo separado; está embebido en `name` tras `" de "`:  
  `"05-08-18 de GENÉRICO"` → fabricante = `"GENÉRICO"`
- **Filtrado:** cliente carga los 1253 una vez (cache proxy 30 min), filtra en memoria.
- **ID real:** en lista `id=0`; extraer de `links[0].href` último segmento (ver `extractFertilizerId()`).
- **Asimetría lista/detalle:** lista usa `cao`; detalle usa `ca/mg/s/na`.

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
**Nota edición archivos largos:** usar siempre la herramienta Edit sobre rutas Windows (`C:\work\...`). El mount Linux (`/sessions/.../mnt/`) puede estar desincronizado con el disco real → Python/bash sobre esa ruta edita una versión obsoleta sin error aparente. Nunca sobreescribir archivos largos con Write directamente.  
**Git workflow:** Claude edita archivos, el usuario ejecuta todos los comandos git desde PowerShell.

## ⚠ Regla de cierre de sesión — CRÍTICO

**Vercel despliega desde git, no desde disco.** Un archivo editado en local pero no commitido NO llega a producción.

Al finalizar cada sesión de trabajo, ejecutar siempre:

```powershell
git status
```

Y commitir **todo** lo que aparezca como modificado (`M`) o nuevo (`??`) antes de dar la sesión por cerrada. Si hay archivos sin commitir, la producción no refleja el trabajo hecho.

**Incidente 2026-06-18:** AsesoramientoPanel.jsx, tiposMaterialFertilizante.js, App.jsx, exportExcel.js, exportPdf.js, SueloCard.jsx, ResultadosCard.jsx y MapPicker.jsx fueron editados en sesión pero nunca commitidos. Resultado: ninguna feature de esa sesión llegó a producción hasta que se detectó manualmente.

## App.jsx — estado global ampliado

```js
// asesor — persiste en localStorage
const [asesor, setAsesor] = useState(() => JSON.parse(localStorage.getItem('fertipro_asesor') || 'null') || { nRegfer:'', nombre:'', apellidos:'', nif:'', telefono:'', email:'' })
useEffect(() => { localStorage.setItem('fertipro_asesor', JSON.stringify(asesor)) }, [asesor])

// planItems — plan de aplicaciones unificado (sativum + asesor), sesión 4 2026-06-18
const [planItems, setPlanItems] = useState([])
const [sativumDialogOpen, setSativumDialogOpen] = useState(false)
const handleAddPlanItems = useCallback((items) => {
  const arr = Array.isArray(items) ? items : [items]
  setPlanItems(prev => [...prev, ...arr])
}, [])
```

`planItems` — array de items unificado (ambos orígenes):
```js
{ id: Date.now(), origen: 'sativum'|'manual', nombre, tipo, tipoSIEX, n, p2o5, k2o, cantidad, fechaAplicacion, esPersonalizado }
```
- `origen` — `'sativum'` (propuesta API) | `'manual'` (asesor)
- `tipoSIEX` — nombre SIEX (string), obligatorio para manual; opcional para sativum
- `esPersonalizado` — bool; cuando true, composición NPK fue introducida manualmente

## Arquitectura plan de abonado (sesión 4 — 2026-06-18)

**Motor iterativo con balance de NPK:**

1. `handleCalcularNecesidades` calcula NPK bruto + almacena `npkParaRec` en `resultados`
   (NPK neto en elemento puro, ya descontado el riego). Resetea `planItems = []`.
2. El usuario puede añadir aplicaciones en cualquier orden:
   - **Botón "Añadir aplicación Sativum"** → abre `SativumApplicationDialog`
     - Sliders de % objetivo por nutriente (partiendo de lo ya cubierto por planItems)
     - Calcula delta → llama `getRecomendacion(delta, {adjustedNutrient})` → 5 opciones
     - Usuario elige 1 → crea N items con `origen:'sativum'`
   - **FertilizanteManualPanel** → selector SIEX + catálogo o PERSONALIZADO
     → crea items con `origen:'manual'`
3. Balance = `npkToCover - Σ(aportaciones planItems)`; barras de cobertura en ResultadosCard
4. Items se muestran ordenados por `fechaAplicacion` en FertilizanteManualPanel
5. Export Excel/PDF usa `planItems` unificado, ordenado por fecha, con columna Origen

**Componentes afectados:**
- `ResultadosCard.jsx` — muestra NPK bruto + barras de cobertura + botón Sativum
- `SativumApplicationDialog.jsx` — modal slider + 5 opciones API
- `FertilizanteManualPanel.jsx` — lista planItems ordenados, badge Sativum/Asesor
- `exportExcel.js` — hoja "Fertilizantes" usa `allItems = planItems ?? fertilizadoresManuales`
- `exportPdf.js` — sección 7 "PLAN DE APLICACIONES" (sin sección Sativum estática)

## Commits recientes (2026-06-18)

```
(pendiente hash) feat: arquitectura plan iterativo — planItems unificado, SativumApplicationDialog, cobertura NPK
        — App.jsx: planItems state, sativumDialogOpen, npkParaRec, handleAddPlanItems
          quita auto-getRecomendacion; quita import getRecomendacion
        — SativumApplicationDialog.jsx: nuevo modal slider + 5 opciones API Sativum
        — ResultadosCard.jsx: barras cobertura plan + botón "Añadir aplicación Sativum"
        — FertilizanteManualPanel.jsx: usa planItems unificado, badges sativum/asesor, orden fecha
        — exportExcel.js: hoja Fertilizantes usa allItems ordenado por fecha, col Tipo SIEX
        — exportPdf.js: sección 7 "PLAN DE APLICACIONES" unificado, quita tabla Sativum estática
(pendiente hash) fix: superficie recinto Excel — usa recinto enriquecido (superficie_total_ha)
(pendiente hash) fix: PDF — agua riego sección propia, UF P2O5/K2O, sin Unicode; panel → Recomendación asesor
849dc53 feat: PERSONALIZADO vinculado a tipo SIEX (RD 1051/2022) en FertilizanteManualPanel
09917a2 feat: fechas inicio/fin de ciclo en panel, Excel y PDF
ad8c2a3 feat: uso_sigpac + coef_regadio via servicio REST SIGPAC recinfo
```

## Backlog

### Activo (próxima sesión)

_Sin ítems activos._

### En espera

3. **CEC dinámico** — Cuando ITACyL publique capa ArcGIS de CEC, reemplazar valores por textura.

### Completados (2026-06-18, sesión 4)

- ✅ **Arquitectura plan iterativo (planItems unificado)** — Rediseño completo del motor de plan:
  `fertilizadoresManuales` reemplazado por `planItems` con `origen:'sativum'|'manual'`.
  `SativumApplicationDialog.jsx` nuevo: sliders de % objetivo, delta NPK, 5 opciones API, multiitem.
  `ResultadosCard.jsx`: barras cobertura N/P2O5/K2O vs. necesidad bruta + botón Sativum.
  `FertilizanteManualPanel.jsx`: lista planItems unificada ordenada por fecha, badges origen.
  `exportExcel.js`: hoja Fertilizantes usa allItems ordenado por fecha, col Tipo SIEX.
  `exportPdf.js`: sección 7 "PLAN DE APLICACIONES" unificada, eliminada tabla estática Sativum.

### Completados (2026-06-18, sesión 3)

- ✅ **Superficie recinto en Excel plan abonado** — `exportarPlanAbonado` usaba `recinto.superficie_ha`
  (campo OGC, frecuentemente null). Ahora `handleExportarPlan` pasa el recinto enriquecido (buscando
  en la lista `recintos` por clave pr/mu/po/pa/re) y `exportarPlanAbonado` añade fallback
  `superficie_total_ha ?? superficie_ha`. Backlog anterior "Recintos SIGPAC en Excel" cerrado como
  no aplica: flujo de dos ficheros (geometría + plan) es suficiente para el expediente del asesor.

### Completados (2026-06-18, sesión 2)

- ✅ **PDF — caracteres legibles + agua riego como sección propia** — `src/utils/exportPdf.js`.
  Eliminados todos los Unicode (P2O5, K2O, "N acum.", "P2O5 acum.", "K2O acum.").
  Agua de riego extraída de la tabla Sativum → tabla standalone con cabecera azul (sección 5).
  Cabeceras UF P2O5 / UF K2O (nomenclatura química correcta).
- ✅ **FertilizanteManualPanel: "Recomendación asesor"** — renombrado header del panel.

### Completados (2026-06-18, sesión 1)

- ✅ **AsesoramientoPanel (REGFER)** — `src/components/AsesoramientoPanel.jsx`. Panel colapsable
  con datos del asesor. Persiste en `localStorage('fertipro_asesor')`. Badge con nombre colapsado.
  Integrado en App.jsx (estado `asesor`), exportPdf.js (metadatos) y exportExcel.js.
- ✅ **FertilizanteManualPanel (selección manual + SIEX)** — `src/components/FertilizanteManualPanel.jsx`.
  Carga lazy catálogo Sativum (1253 items). Selector tipo SIEX (24 tipos RD 1051/2022) como primer
  selector obligatorio. Filtro fabricante + búsqueda debounce 300ms. PERSONALIZADO como primera opción
  del dropdown (morado) cuando tipoSIEX está seleccionado. esPersonalizado derived. Badge tipoSIEX en
  lista items. Integrado en App.jsx, exportPdf.js y exportExcel.js.
- ✅ **tiposMaterialFertilizante.js** — Data file con 24 tipos SIEX (RD 1051/2022). Pendiente
  integrarlo en FertilizanteManualPanel (backlog ítem 1 de próxima sesión).
- ✅ **ZVN** — `api/sigpac-zvn.js` + `_enrichConZvn()` + `enrichRecintos()` + `ParcelaInfoCard`
  + columna ZVN en Excel + tabla recintos con ZVN en PDF. Funciona para punto y polígono.
- ✅ **Panel lateral reordenado** — GeometryPanel y ParcelaInfoCard suben al primer bloque.
- ✅ **Sistema de explotación** — Badge Secano/Regadío en `SueloCard.jsx` + fila en Excel.
- ✅ **uso_sigpac + coef_regadio** — Proxy `api/sigpac-recinfo.js`; `_enrichConRecinfo()`.
- ✅ **Fechas de ciclo** — `fechaInicioCiclo` / `fechaFinCiclo` en App.jsx, Excel y PDF.
