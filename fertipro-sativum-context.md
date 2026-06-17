# FertiPRO × Sativum — Contexto de continuación

> Copiar y pegar íntegro al inicio del siguiente hilo de Claude,
> junto con acceso a la carpeta `C:\work\fertipro-api-sativum`.

---

## Objetivo de la aplicación

Dado el centroide XY de una parcela agrícola:
1. Obtener datos de suelo desde ArcGIS (Sativum/ITACyL).
2. Seleccionar uno o varios cultivos del catálogo Sativum.
3. Calcular necesidades NPK con el algoritmo FertiliCalc (Villalobos et al. 2020) vía API Sativum.
4. Obtener combinaciones de fertilizantes desde `/recommendation`.
5. Exportar el plan de abonado a Excel.

Sin motor de cálculo propio — todo delegado a la API Sativum (ITACyL).

---

## Stack

- **Frontend**: Vite 5 + React 18 + Leaflet + Geoman + Turf + SheetJS
- **Backend**: Vercel serverless functions en `/api/` (ESM, `"type":"module"` en package.json — necesario para Vercel)
- **Repositorio**: `C:\work\fertipro-api-sativum` / GitHub (privado, Visual Nacert)
- **Deploy**: Vercel, redeploy automático al hacer push a `main`
- **API base**: `https://gateway.api.itacyl.es/sativum`, header `apikey: <token>`
- **Env var en Vercel**: `SATIVUM_API_KEY` (NUNCA expuesta al cliente)
- **Local dev**: `npm run dev` → `http://localhost:5173`

---

## Arquitectura de capas

```
Cliente (React)
  └── src/api/sativum-*.js    (wrappers fetch → /api/*)
        └── api/sativum-*.js  (Vercel proxies → Sativum API)
              └── gateway.api.itacyl.es/sativum
```

---

## Mapa de ficheros completo

### Vercel proxies (`api/`)
| Fichero | Endpoint Sativum | Notas |
|---|---|---|
| `api/sativum-suelo.js` | ArcGIS MapServer/identify | 10 capas; cache s-maxage=600 |
| `api/sativum-crops.js` | `GET /nutrients/crops` | filtros ?name ?group; respuesta es array plano |
| `api/sativum-algo.js` | `POST /fertilicalc/algo/` | trailing slash obligatorio; bug Content-Type text/html → JSON.parse(text()) |
| `api/sativum-fertilizers.js` | lista / detalle / `POST /recommendation` | discrimina por method+params |
| `api/sigpac.js` | SIGPAC FEGA | recinto por lon/lat |
| `api/sigpac-bbox.js` | SIGPAC FEGA | recintos por bounding box |
| `api/sigpac-mvt.js` | Tiles MVT SIGPAC | proxy de tiles vectoriales |

### Clientes React (`src/api/`)
| Fichero | Exports principales |
|---|---|
| `src/api/sativum-suelo.js` | `identifySativum`, `filtrarCapa`, `normalizarSuelo` |
| `src/api/sativum-crops.js` | `getCultivos`, `agruparPorGrupo`, `tieneRendimientoAnomalo` |
| `src/api/sativum-algo.js` | `calcularNPK`, `ensamblarPayloadAlgo`, `cultivoToCropFeatures`, `calcularNAgua` |
| `src/api/sativum-fertilizers.js` | `getFertilizadores`, `getFertilizador`, `getRecomendacion`, `extractFertilizerId` |
| `src/api/sigpac.js` | `getSigpacRecinto` |

### Datos de referencia (`src/data/sativum/`)
| Fichero | Contenido |
|---|---|
| `algoParams.js` | `ALGO_PARAMS[strategy][soilType]`, `N_EQUATION_DEFAULTS`, `MAX_P_RATE=100`, `MAX_K_RATE=275` |
| `fuentesAgua.js` | Catálogo SIEX fuentes; `FUENTE_SUBTERRANEA=2`, `FUENTE_SIN_RIEGO=0` |
| `soilTypes.json` | 12 clases USDA → soilTypeSimplified (101-106) |
| `soilTypesSimpl.json` | 101-106 → descNutrients enum (SANDY, SANDY_LOAM …) |

### Componentes React (`src/components/` y `src/cultivos/`)
| Componente | Props principales | Función |
|---|---|---|
| `CultivoSelector` | `value, onChange` | Selector cultivo con optgroups Sativum |
| `CultivoCard` | `cultivo` | Detalle agronómico del cultivo (HI, fres, n/p/k%, yields) |
| `CultivoAnteriorPanel` | `cultivo, params, onCultivoChange, onParamsChange` | Cultivo precedente en la rotación (colapsable). params={cropYield,laboreo,recogeResiduos,quemaResiduos} |
| `SueloCard` | `suelo, loading, cec, onCecChange, riego, onRiegoChange` | Datos suelo ArcGIS + fuente agua riego SIEX + NO₃/dotación condicional |
| `EstrategiaPanel` | `cultivo, params, onChange` | 4 estrategias + laboreo + rendimiento + residuos + "Ajustes del algoritmo" (N avanzado + P/K overrides). params={strategy,tillage,cropYield,recogeResiduos,quemaResiduos,nEcuacion,algoOverrides} |
| `ResultadosCard` | `npk, recomendacion, cultivo, loading, error` | Grid NPK (elemento + óxido) + fertilizantes recomendados por combinación |
| `RecintoCard` | `recinto, loading, error` | Ficha SIGPAC del recinto |
| `RecintosOrigenCard` | `recintos` | Recintos SIGPAC que componen la parcela construida |
| `GeometryPanel` | `polygons, activeId, onSelect, onRename, onRemove, ...` | Gestión parcelas dibujadas + descarga GeoJSON/SHP/Excel SIGPAC |

### Utils
| Fichero | Contenido |
|---|---|
| `src/utils/exportExcel.js` | `exportarRecintosSigpacExcel`, `exportarPlanAbonado` (3 hojas: Plan, Fertilizantes, Notas) |
| `src/utils/geometry.js` | centroide, multipart, GeoJSON/SHP export |
| `src/utils/recintosInterseccion.js` | intersección parcela × recintos SIGPAC |
| `src/utils/slugify.js` | slugify para nombres de archivo |
| `src/map/MapPicker.jsx` | Leaflet + Geoman (dibujo/edición parcelas) |

---

## Estado de App.jsx

### Estados relevantes para el cálculo

```js
const [cultivo,  setCultivo]  = useState(null)        // objeto catálogo Sativum
const [suelo,    setSuelo]    = useState(null)         // normalizarSuelo() output
const [cec,      setCec]      = useState(220)          // meq/kg, editable
const [riego,    setRiego]    = useState({ fuenteId: 0, no3MgL: '', dotacionM3: '' })
const [fecha,    setFecha]    = useState(() => new Date().toISOString().slice(0, 10))

const [cultivoAnterior,       setCultivoAnterior]       = useState(null)
const [cultivoAnteriorParams, setCultivoAnteriorParams] = useState({
  cropYield: null, laboreo: false, recogeResiduos: false, quemaResiduos: false,
})

const [calculo, setCalculo] = useState({
  strategy:      'MAINTENANCE',
  tillage:       false,
  cropYield:     null,
  recogeResiduos: false,
  quemaResiduos:  false,
  nEcuacion:      {},
  algoOverrides:  {},   // { pThreshold, kThreshold, maxPRate, maxKRate, efficiencyFactor } — null = default estrategia
})

const [resultados, setResultados] = useState({
  npk: null, recomendacion: null, loading: false, error: null,
})
```

### Flujo handleCalcularNecesidades

1. Determina `riegoOpts` según `fuente SIEX`: subterránea=usa ArcGIS NO₃, demás=manual
2. Construye `cultivosArr`: prepend cultivoAnterior con `cv=30`, append cultivo actual con `cv=0`
3. Fallback suelo si no hay ArcGIS: LOAM, MO=2, ph/p/k=null
4. Llama `calcularNPK(cultivosArr, sueloEfectivo, { strategy, tillage, cec, riego, nEcuacion, algoOverrides })`
5. Si `npkData` → llama `getRecomendacion(npkData)` → guarda en `resultados`

### Orden visual del aside

CultivoSelector → GeometryPanel → RecintoCard → RecintosOrigenCard → SueloCard → CultivoAnteriorPanel → **fecha input** → EstrategiaPanel → botón Calcular → ResultadosCard → botón Exportar Excel → CultivoCard → footer

---

## Bugs conocidos / reglas de negocio críticas

| ID | Descripción |
|---|---|
| B1 | `/fertilicalc/algo/` devuelve Content-Type: text/html → parsear con `JSON.parse(text())` en el proxy |
| B2 | Trailing slash obligatorio en `/fertilicalc/algo/` |
| B3 | `id=0` en `/recommendation` → ID real en `links[0].href` último segmento |
| B4 | `plant_species_group` debe ir en MAYÚSCULAS (CEREALS, no Cereals) |
| B5 | `nfixCode`: catálogo devuelve int (0/1), API espera boolean |
| B6 | Cultivo id=147 tiene yieldMedium < yieldLow (dato anómalo) → `tieneRendimientoAnomalo()` |
| B7 | Cereal residue rule: si fres=10 y no recoge paja → `f_res=100` en el payload |
| B8 | Conversiones /recommendation: P×2.2914 (P→P₂O₅), K×1.2046 (K→K₂O) |
| B9 | SIGPAC 502 es error upstream FEGA (transitorio) — no es bug de la app |
| B10 | Vercel requiere `"type":"module"` en package.json para ESM nativo; sin ello compila CJS y falla |

---

## Fórmulas clave

```
n_other = 10 (deposición fija) + N_agua_riego
N_agua_riego = NO₃(mg/L) × dotación(m³/ha) × 0.001 × (14/62)

Fuente SIEX=2 (subterránea) → NO₃ ArcGIS, K ArcGIS
Otras fuentes → inputs manuales del usuario

P_to_P2O5 = 2.2914   (para /recommendation y Excel)
K_to_K2O  = 1.2046   (ídem)
```

---

## Backlog pendiente (post-sesión)

| # | Tarea | Prioridad |
|---|---|---|
| P1 | **Bug exportExcel.js línea ~189**: `row('Rendimiento objetivo', ..., 't/ha')` → debe ser `'kg/ha'` | Alta |
| P2 | **¿Abono verde? checkbox** en EstrategiaPanel: el usuario lo pidió (`¿abono verde?`) pero no se implementó. Añadir junto a `recogeResiduos/quemaResiduos`, pasar al payload como `green_manure` o similar (verificar campo en API) | Alta |
| P3 | **CultivoAnteriorPanel residuos**: actualmente solo muestra residuos para cereales fres=10 (igual que EstrategiaPanel antes de esta sesión). Aplicar la misma corrección: mostrar para todos los cultivos | Media |
| P4 | **Actualizar footer App.jsx**: sigue diciendo "Pendiente: motor de cálculo NPK, exportar" — ya no es pendiente | Baja |
| P5 | **Clasificación automática tipo suelo**: ArcGIS devuelve `soilTypeSimplified` (101-106); los JSONs `soilTypes.json` / `soilTypesSimpl.json` mapean a SANDY/LOAM/etc. pero no está completamente conectado en `normalizarSuelo()` | Media |
| P6 | **Avisos ZVN** (Zonas Vulnerables a Nitratos): detectar si la parcela está en ZVN según capa ITACyL y mostrar aviso con límite N aplicable | Media |
| P7 | **Mapeo SIEX↔Sativum**: pre-seleccionar cultivo Sativum a partir del uso SIGPAC del recinto (tabla de correspondencias) | Baja |
| P8 | **ResultadosCard**: mejorar display de múltiples combinaciones (actualmente muestra las primeras); añadir selector de combinación | Baja |
| P9 | **Verificar flujo completo en Vercel** tras el último commit | Inmediato |

---

## Pendiente de commitear (tras esta sesión)

Los siguientes ficheros tienen cambios locales que aún NO se han pusheado:

```
git add src/components/EstrategiaPanel.jsx src/App.jsx src/utils/exportExcel.js
git add src/components/GeometryPanel.jsx src/api/sativum-algo.js
git commit -m "feat: mejoras UI post-revisión — residuos todos cultivos, ajustes algoritmo P/K, fecha plan, sin badge Próximamente"
git push
```

---

## Notas operativas para Claude

- **Acceso repo**: `C:\work\fertipro-api-sativum` → en bash (si funciona): `/sessions/.../mnt/fertipro-api-sativum/`
- **Bash y OneDrive**: bash no ve ficheros cloud-only de OneDrive → usar `Read` directamente con rutas Windows
- **Git**: Miguel Ángel ejecuta `git add / commit / push` en PowerShell y comparte la salida
- **Vercel**: redeploy automático al push a `main`; variables de entorno se gestionan en el dashboard de Vercel
- `SATIVUM_API_KEY` es una variable de entorno Vercel — NUNCA se muestra al cliente ni se hardcodea
- **Unidades**: catálogo Sativum usa kg/ha (no t/ha) para yieldLow/Medium/High

---

## Ficheros a compartir en el nuevo hilo

**Obligatorio:**
- Acceso a la carpeta `C:\work\fertipro-api-sativum` (para que Claude pueda leer cualquier fichero)
- Este fichero `fertipro-sativum-context.md` (pegarlo como texto en el primer mensaje)

**Opcional pero útil:**
- Screenshot de la UI actual en Vercel (para ver el estado visual)
- Screenshot de la consola del navegador si hay errores tras el push
