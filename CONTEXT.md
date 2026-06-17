# FertiPRO × Sativum — Contexto de desarrollo (actualizar en cada sesión)

> **Última actualización:** 2026-06-17 (sesión 3)  
> **Stack:** Vite 5 + React 18 + Leaflet + Geoman + Turf + SheetJS / Vercel serverless `/api/`  
> **API base:** `https://gateway.api.itacyl.es/sativum` — header `apikey: SATIVUM_API_KEY` (env Vercel, NUNCA al cliente)  
> **Repo:** GitHub privado Visual Nacert — git lo gestiona el usuario en PowerShell

---

## 1. Arquitectura del flujo de cálculo

```
Usuario selecciona punto en mapa
  → identifySativum() [ArcGIS] → suelo: { soilType, organicMatter, ph, pOlsen, kSoil, soilTypeUsdaLabel, ... }
  → getSigpacRecinto() → recinto SIGPAC

Usuario selecciona cultivo actual (CultivoSelector)
Usuario selecciona cultivo anterior (CultivoAnteriorPanel) — OPCIONAL

handleCalcularNecesidades():
  1. ensamblarPayloadAlgo(cultivosArr, suelo, opts)
       rotation = [ cultivoAnterior?, cultivoActual ]   ← orden importante
  2. POST /api/sativum-algo → POST upstream /fertilicalc/algo/
       respuesta: { n, p, k } o { recommendations[0].{n,p,k} }
  3. Auto-selección adjustedNutrient (mayor UF, evita N=0 con leguminosas)
  4. POST /api/sativum-fertilizers → /recommendation
       respuesta: { recommendations: [...5 combos...], observations: [...] }
  5. Render en ResultadosCard
```

---

## 2. Bugs críticos resueltos (no volver a romper)

| ID | Fichero | Descripción | Fix |
|----|---------|-------------|-----|
| B1 | api/sativum-algo.js | `/fertilicalc/algo/` devuelve Content-Type: text/html | `JSON.parse(await res.text())` |
| B2 | api/sativum-algo.js | Trailing slash obligatorio | URL termina en `/algo/` |
| B3 | api/sativum-fertilizers.js | `id=0` en `/recommendation` | Leer ID real de `links[0].href` último segmento |
| B4 | src/api/sativum-algo.js | `plant_species_group` debe ser MAYÚSCULAS | `.toUpperCase()` en `cultivoToCropFeatures` |
| B5 | src/api/sativum-algo.js | `nfixCode` catálogo int (0/1), API espera boolean | `Boolean(cultivo.nfixCode)` |
| B7 | src/api/sativum-algo.js | Cereales con `fres=10` y no recoge paja → `f_res=100` | Regla en `cultivoToCropFeatures` |
| B8 | src/api/sativum-fertilizers.js | Conversiones antes de `/recommendation` | P×2.2914, K×1.2046 |
| B-npk | src/App.jsx | NPK podía venir en `recommendations[0].n` no en top-level | `npkData.n ?? npkData.recommendations?.[0]?.n ?? 0` |
| B-adj | src/App.jsx | `adjustedNutrient='N'` con N=0 → Sativum no genera combos | Auto-selección por mayor UF |
| **B-stale** | **src/App.jsx** | **`cultivoAnterior` y `cultivoAnteriorParams` faltaban en deps del useCallback** → stale closure, cambios en cultivo anterior ignorados en cálculo | **Añadir ambos a deps array** ✅ |
| **B-tillage** | **src/App.jsx + EstrategiaPanel.jsx** | **"Laboreo tras cosecha" (CultivoAnteriorPanel) nunca llegaba al payload; existían dos checks de laboreo redundantes** | **Eliminado "Laboreo previo al abonado" de EstrategiaPanel; `tillage: cultivoAnteriorParams.laboreo` en `handleCalcularNecesidades`** ✅ sesión 2 |
| **B-recom** | **src/components/ResultadosCard.jsx** | **`/recommendation` devuelve `{ unique: [...] }` no `{ recommendations: [] }` — las combinaciones nunca se mostraban** | **`recList` ahora lee `unique \| simple \| binary \| ternary \| recommendations`; `RecomendacionItem` trata el item directo como fertilizante si no hay `.fertilizers`** ✅ sesión 3 |

---

## 3. Campos del payload `/fertilicalc/algo/`

### Rotation item (por cada cultivo en la rotación):
```json
{
  "crop_yield": 7100,
  "cv": 60,
  "collect_residues": false,
  "burn_residues": false,
  "crop_features": { ... }
}
```

**`cv` = coeficiente de variación del rendimiento** (Villalobos et al. 2020).  
⚠️ **La UI de Sativum lo fija a 0 para todos los cultivos y el catálogo también devuelve 0.**  
El campo existe en el schema pero **NO influye en el cálculo actual del endpoint** — es un parámetro reservado para el modo FAST (N20/N80, rango año bueno/malo) que no está operativo en la API ITACyL.  
→ Dejar `cv: cultivo.cv ?? 0` (o simplemente `cv: 0`). No perder tiempo en esto.

### `green_manure`:
**NO existe** en el schema oficial de `/fertilicalc/algo/`. Campo eliminado del payload. Pendiente verificar si Sativum lo soporta con otro nombre.

### Rotation order:
El array `rotation` tiene el cultivo **anterior primero**, el **actual al final**. El orden es lo que distingue precedente de objetivo; no hay campo explícito `is_current`.

---

## 4. Metodología de debugging API Sativum

La respuesta de `/fertilicalc/algo/` **echa de vuelta (echo) la configuración completa** que procesó, junto con el resultado N/P/K. Esto permite una técnica sistemática:

**Variar un campo del request → observar qué cambia en el response.**

Campos a verificar así (uno a uno, rest igual):
- `rotation[0].crop_yield` → ¿cambia N del response? → confirma que el cultivo anterior opera
- `collect_residues: true/false` → ¿cambia N? → confirma que la gestión de residuos opera
- `burn_residues: true/false` → ¿cambia N?
- `nfix_code: true/false` → ¿cambia N? → confirma fijación de N por leguminosas
- `cv: 0 vs 90` → ¿cambia N? → confirma si CV está operativo en el endpoint actual
- `green_manure: true` → ¿acepta el campo? ¿cambia N? → descubrir si existe y qué nombre tiene

Esta metodología sirve para cualquier campo dudoso: si el response N no cambia al variar el campo, ese campo no opera en el cálculo actual (puede ser reservado para funcionalidad futura como FAST N20/N80).

---

## 5. ⚠️ MOMENTO CRÍTICO: Prueba en producción (PENDIENTE)

Esta es la verificación que hay que hacer **tras el siguiente `git push` + redeploy en Vercel**:

### Qué probar:
1. Ir a la URL de producción
2. Hacer clic en un punto del mapa (zona de Castilla y León con suelo definido)
3. Seleccionar cultivo actual (p.ej. **Trigo blando de invierno**)
4. Seleccionar cultivo anterior (p.ej. **Veza verde/floración** — leguminosa fijadora)
5. Poner rendimiento cultivo anterior en **12.000 kg/ha** → Calcular
6. Cambiar rendimiento a **4.000 kg/ha** → Calcular de nuevo

### Qué verificar en Network tab (F12 → Network → `sativum-algo`):
- ✅ `rotation[0].crop_yield` cambia entre 12000 y 4000 (stale closure resuelto)
- ✅ `rotation[0].cv` = el valor del catálogo para Veza (esperado ~90), NO 30 hardcoded
- ✅ `rotation[1].cv` = el valor del catálogo para Trigo, NO 0 hardcoded
- ✅ El resultado N cambia entre ambos cálculos (si es leguminosa, N debería ser bajo)

### Qué anotar si falla:
- Si `rotation[0].cv` sigue siendo 0 → `cultivo.cv` no viene del catálogo; necesita fallback distinto
- Si N no cambia → copiar el payload completo de ambas peticiones y pegarlo aquí

---

## 5. Arquitectura de ficheros clave

```
src/
  App.jsx                        ← estado global + handleCalcularNecesidades
  api/
    sativum-algo.js              ← ensamblarPayloadAlgo() + calcularNPK()
    sativum-crops.js             ← getCultivos(), agruparPorGrupo()
    sativum-fertilizers.js       ← getRecomendacion() + conversiones P/K
    sativum-suelo.js             ← identifySativum() + normalizarSuelo()
  components/
    EstrategiaPanel.jsx          ← estrategia, rendimiento, accordion N avanzado (laboreo eliminado)
    CultivoAnteriorPanel.jsx     ← cultivo precedente, producción, residuos
    ResultadosCard.jsx           ← NPK + combinaciones fertilizantes + observaciones
    SueloCard.jsx                ← análisis suelo ArcGIS (textura USDA + simplificada)
  cultivos/
    CultivoSelector.jsx          ← combobox buscable con grupos
    CultivoCard.jsx              ← tarjeta detalle cultivo
  data/sativum/
    algoParams.js                ← tabla estrategia × textura → defaults P/K/eficiencia
    soilTypes.json               ← mapeo pixel USDA 1-12 → etiqueta
api/                             ← proxies serverless Vercel
  sativum-algo.js
  sativum-crops.js
  sativum-fertilizers.js
  sativum-suelo.js
```

---

## 6. Backlog pendiente

| # | Tarea | Prioridad |
|---|-------|-----------|
| B-cv-verify | Verificar en Network que `cultivo.cv` llega del catálogo (prueba producción §4) | 🔴 INMEDIATO |
| B-warn | Tooltip/aviso en CultivoSelector y CultivoAnteriorPanel cuando `tieneRendimientoAnomalo()=true` (yieldMedium < yieldLow, bug catálogo Sativum) | 🟡 |
| B-green-manure | Verificar nombre correcto del campo `green_manure` (o equivalente) en la API. Existe en UI de Sativum pero no en el schema documentado. | 🟡 |
| P5 | Conectar `soilTypeSimplified` (101-106) mapping completo en `normalizarSuelo` | 🟢 |
| P6 | Detección y alerta de Zonas Vulnerables a Nitratos (ZVN) | 🟢 |
| P7 | Mapeo SIEX ↔ Sativum para pre-selección de cultivo según datos SIGPAC | 🟢 |
| P-residuos-actual | "Gestión de residuos" del cultivo ACTUAL (recoge paja de este año) eliminada de la UI por simplicidad. Valorar si reintroducir en EstrategiaPanel o en otro panel. | 🟢 |

---

## 7. Reglas y convenciones que NO olvidar

- **SATIVUM_API_KEY** nunca al cliente ni hardcodeada. Solo en env Vercel, solo en `/api/*.js` serverless.
- **Git** lo hace siempre el usuario en PowerShell (`git add -A && git commit -m "..." && git push`). Claude no ejecuta git.
- **Trailing slash** en `/fertilicalc/algo/` — el gateway rechaza sin ella.
- **Content-Type text/html** del upstream algo — usar `JSON.parse(text())` en el proxy.
- **`plant_species_group` en MAYÚSCULAS** — usar `.toUpperCase()` siempre.
- **B7** — Cereales + `fres=10` + no recoge paja → `f_res=100` en payload.
- **Conversiones a óxido** — solo en `getRecomendacion()`, no antes.

---

## 8. Permisos de carpeta necesarios para Claude

Para continuar sin perder contexto en nuevas sesiones, Claude necesita acceso a:

| Carpeta | Estado | Para qué |
|---------|--------|----------|
| `C:\work\fertipro-api-sativum` | ✅ Conectada | Leer/editar el código |
| `C:\Users\...\Documentos\Visual\Plan de abonado` | ✅ Conectada | Guardar entregables |

**No se necesitan carpetas adicionales** para este proyecto. Con acceso al repo es suficiente.  
Este fichero (`CONTEXT.md`) debe estar en la raíz del repo para que Claude lo lea al inicio de cada sesión nueva.
