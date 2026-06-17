# FertiPRO × Sativum — CLAUDE.md

Briefing técnico para arrancar una sesión de trabajo sin contexto previo.

## Qué es esto

Aplicación web de planificación de abonado para agricultores españoles. Calcula necesidades NPK usando el motor FertiliCalc (Villalobos et al. 2020) a través de la API Sativum (ITACyL). Desplegada en Vercel.

## Stack

- **Frontend:** Vite 5 + React 18, sin framework CSS
- **Mapa:** Leaflet + leaflet-geoman (dibujo de parcelas) + Turf (geometría)
- **Backend:** Vercel serverless functions en `/api/` (proxies a Sativum)
- **Exportación:** SheetJS (Excel) — PDF pendiente implementar
- **SIGPAC:** OGC API Features (FEGA) para recintos

## Seguridad — regla inamovible

`SATIVUM_API_KEY` **nunca** al cliente, **nunca** hardcoded. Solo en variables de entorno Vercel, solo dentro de `/api/*.js`.

## Estructura relevante

```
src/
  App.jsx                    — raíz, estado global, handleCalcularNecesidades
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
  utils/
    exportExcel.js           — exportarPlanAbonado + exportarRecintosSigpacExcel
api/
  sativum-algo.js            — proxy POST /fertilicalc/algo/
  sativum-fertilizers.js     — proxy GET /nutrients/fertilizers/recommendation
  sativum-crops.js           — proxy GET /nutrients/crops
  sigpac-punto.js            — proxy SIGPAC OGC
```

## Flujo de cálculo (orden estricto)

1. `identifySativum(lon, lat)` → ArcGIS MapServer → `normalizarSuelo()` (MO, textura, pH, P Olsen, K suelo, NO₃ riego, K riego)
2. `calcularNPK(cultivosArr, suelo, opts)` → POST `/api/sativum-algo` → `recommendations.at(-1)` para el cultivo actual
3. Calcular `pRiego` y `kRiego` (mg/L × m³/ha / 1000) → restar de npkNorm.p/k → `npkParaRec`
4. `nRiego = calcularNAgua(no3MgL, dotacionM3)` — solo para display (el motor ya lo descuenta via `n_other`)
5. `getRecomendacion(npkParaRec, { adjustedNutrient })` → POST `/api/sativum-fertilizers`
6. Display: N bruto = `N_motor + nRiego`, P₂O₅/K₂O brutos directos del motor

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
npm run dev          # Vite dev server (localhost:5173)
npx vercel dev       # Simula serverless functions en local
git add .; git commit -m "..."; git push   # Despliegue a Vercel automático
```

**Nota PowerShell:** usar `;` como separador, no `&&`.

## Backlog

1. PDF exportación estilo "Plan de Nutrientes" de Sativum (ver PDF de referencia en uploads de sesión anterior)
2. Proxy catálogo: `api/sativum-fertilizers.js` línea 68 — forward query params al upstream
