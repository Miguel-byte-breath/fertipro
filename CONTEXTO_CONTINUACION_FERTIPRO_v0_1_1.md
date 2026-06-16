# FertiPRO — Contexto de continuación

**Versión:** v0.1.1 *(post-validación Sativum)*
**Fecha:** 2026-06-15
**Empresa:** Visual Nacert (Valencia)

---

## Identidad del proyecto

| Campo | Valor |
|---|---|
| Repo GitHub | `https://github.com/Miguel-byte-breath/fertipro` (privado) |
| Deploy Vercel | `https://fertipro.vercel.app/` |
| Tag canónico | `v0.1.0` *(base geográfica cerrada — Geometría + SIGPAC + Excel)* |
| Repo local | `C:\work\fertipro` |
| Stack | Vite 5 + React 18 + Leaflet 1.9 + Geoman + Turf 7 + SheetJS + JSZip |
| Arranque local | `npm install && npm run dev` *(localhost:5173, sin Vercel CLI)* |
| Despliegue | `git push` *(redeploy automático en 2-3 min)* |

---

## Objetivo de FertiPRO

Simulador de **planes de abonado** sobre la geometría real de la parcela del agricultor. Sobre la base canónica `v0.1.0` (mapa + SIGPAC + geometría editable + Excel), integrar **Sativum/ITACyL** como motor único de cálculo NPK y recomendación de fertilizantes, generando un plan utilizable en el campo.

---

## Estado de la base canónica `v0.1.0` (ya cerrado)

- Mapa: Leaflet + PNOA + capa SIGPAC (WMS ráster + MVT vectorial) + Geoman
- Geometría: tres formas de definir hoja de cultivo
  - Dibujo libre con Geoman
  - Carga GeoJSON / Shapefile (.zip con .shp + .dbf)
  - Construcción desde recintos SIGPAC (selección múltiple)
- Edición persistida (`pm:edit` y `pm:cut` capturados a nivel layer)
- Output del selector del panel:
  - Descarga GeoJSON / Shapefile *(parcela activa o todas)*
  - Excel SIGPAC con tres hojas (Resumen / Recintos / Notas) con etiquetas semánticas Completo / Recortado / Parcial
- API key unificada de Sativum (la misma cubre `sativumarcgis` y `sativum/*`)
- API existente en `api/sativum.js` → proxy a `sativumarcgis/MapServer/identify` (pendiente rename a `api/sativum-suelo.js`)

---

## Backlog actual

### Completadas

| # | Tarea |
|---|---|
| 1 | Decidir estrategia Sativum *(100% Sativum motor + catálogo)* |
| 14 | Verificar unidades NPK en respuesta `/algo/` *(P y K elemento puro)* |

### Pendientes — orden de implementación

**FASE A — Backend Sativum (infraestructura, sin UI nueva)**

| # | Tarea | Notas implementación |
|---|---|---|
| 2 | Config `SATIVUM_API_KEY` + rename `api/sativum.js → api/sativum-suelo.js` | Una sola apikey, válida para los 5 endpoints + ArcGIS |
| 3 | `api/sativum-crops.js` proxy `GET /nutrients/crops` | Cache `s-maxage=300, swr=1800`; payload plano sin `items` wrapper |
| 4 | `api/sativum-algo.js` proxy `POST /fertilicalc/algo/` | RESPETAR barra final; en wrapper cliente `JSON.parse(await res.text())` por bug content-type text/html upstream |
| 5 | `api/sativum-fertilizers.js` (lista + detalle + recomendación) | Cache `s-maxage=1800` para lista; helper `extractFertilizerId(p)` para parsear ID real de `links[0].href` |

**FASE B — UI selección agronómica**

| # | Tarea | Notas |
|---|---|---|
| 6 | Reescribir `CultivoSelector` + `CultivoCard` contra Sativum | Catálogo Sativum, agrupar por `plantSpeciesGroup`; defensive: aviso si `yieldMedium < yieldLow` |
| 7 | UI suelo + agua de riego (centroide → `sativumarcgis`, override manual) | Auto-rellenado de 7 campos; CEC manual hasta que ITACyL publique la capa |
| 8 | UI estrategia + parámetros N + rendimiento esperado | 4 estrategias enum; regla del residuo (Cereals + fres=10 → f_res=100 si no se recoge); ajustes algoritmo plegables como en UI Sativum |

**FASE C — Cálculo y plan resultante**

| # | Tarea | Notas |
|---|---|---|
| 9 | Orquestación `handleCalcularNecesidades` + vista resultados | **Una llamada `/algo/` + `/recommendation` por cultivo** (receta individual); mostrar deltas pedido vs aplicado |
| 10 | Export Excel/PDF del plan completo | Plan completo: parcelas + recintos + cultivos + suelo + estrategia + necesidades NPK + recomendación fertilizantes |

**FASE D — Refinamientos diferidos**

| # | Tarea |
|---|---|
| 11 | JSONs auxiliares ITACyL *(parcial: equivalencias resueltas, defaults pendientes)* |
| 12 | Avisos legales ZVN (RD 47/2022 + RD 1051/2022) — integrable con `fertipro-zonas-normativas` |
| 13 | Mapeo Sativum ↔ JSON propio 157 cultivos *(Ca/Mg/S/micros, hibernado)* |

---

## Arquitectura Sativum (validada con curls reales)

```
1. (opcional) sativumarcgis/MapServer/identify  →  análisis suelo + agua riego (10 capas)
2. (obligatorio) GET /nutrients/crops            →  perfil agronómico del cultivo
3. (obligatorio) POST /fertilicalc/algo/         →  cálculo NPK por cultivo
4. (consulta) GET /nutrients/fertilizers (+/{id}) →  catálogo (1253 productos) / detalle
5. (obligatorio) POST /nutrients/fertilizers/recommendation → 5 mejores combinaciones
```

**Base URL:** `https://gateway.api.itacyl.es/sativum` (y `…/sativumarcgis` para el ArcGIS)
**Auth:** header literal `apikey: <token>`

---

## Decisiones arquitectónicas firmes

| Decisión | Razón |
|---|---|
| Motor 100% Sativum (`/fertilicalc/algo/`) | Algoritmo FertiliCalc + FAST validado peer-review (Villalobos et al. 2020); aceptado por administración española |
| Catálogo 100% Sativum (`/nutrients/crops`) | El algoritmo espera ese formato exacto; reduce mantenimiento propio |
| JSON propio 157 cultivos en hibernación | Reactivable para mapeo enriquecido (Ca/Mg/S/micros) en `#13` |
| Una llamada `/algo/` + `/recommendation` **por cultivo** | El motor `/recommendation` recibe `npkToCover` único — para receta por cultivo, una llamada por cultivo |
| Convertir `P → P₂O₅ (×2.2914)` y `K → K₂O (×1.2046)` en el cliente | Output `/algo/` es elemento puro; encadenar a `/recommendation` y mostrar al usuario exige óxidos |
| Centroide de la parcela → `sativumarcgis` | Auto-rellenar suelo y agua, con override manual para analítica propia |
| Etiquetas UI en español copiadas de la app oficial Sativum | Consistencia con la herramienta de referencia del sector |
| Defensive parsing en `/algo/` | Upstream devuelve `Content-Type: text/html` aunque body sea JSON — usar `JSON.parse(await res.text())` |

---

## Hallazgos críticos validados con respuestas reales

### `GET /nutrients/crops`
- ✅ Estructura plana (sin envoltorio `items` que dice la doc OpenAPI — quirk de la spec)
- ✅ Campo extra `links: [{rel,href}]` (HATEOAS) → link canónico a `sativum.es`
- ⚠️ Anomalía detectada: `yieldMedium < yieldLow` en "Cebada (siega en verde/forraje)" (id 147) — defensive aviso en `CultivoCard`
- ⚠️ `plantSpeciesGroup` capitalizado mixto (`Cereals`, `Forage_legume`) → `.toUpperCase()` para el algoritmo
- ⚠️ `Content-Type` correcto: `application/json`
- ⚠️ `Cache-Control: no-cache` upstream → override en edge Vercel a `s-maxage=300, swr=1800` (catálogo cambia rara vez)

### `POST /fertilicalc/algo/`
- ✅ **UNIDADES CONFIRMADAS** empíricamente: `recommendations[i].p` y `.k` están en **kg P/ha y kg K/ha elemento puro** (NO óxidos)
- ✅ Cultivo con `nfix_code=1` devuelve `n=0` (fijación simbiótica respetada)
- ✅ Incluso en `MAINTENANCE`, todos los campos `soil/sample/p_threshold/k_threshold/soil_effect/efficiency_factor` son obligatorios — el motor los ignora pero el payload los exige (usar placeholders)
- ⚠️ **`Content-Type: text/html`** aunque el body sea JSON válido → defensive parsing
- ⚠️ Respetar barra final en URL upstream
- Mapper requerido `cultivoSativumToCropFeatures(cultivo, opts)`:
  - `nfixCode` (int 0/1) → `nfix_code` (bool)
  - `plantSpeciesGroup` (`Cereals`) → `plant_species_group` (`CEREALS`)
  - camelCase → snake_case (`dryMatter → dry_matter`, `resN → res_n`, `fres → f_res`, etc.)
- Estrategias enum: `MAINTENANCE` / `SUFFICIENCY` / `REDUCED` / `MAXIMUM`

### `GET /nutrients/fertilizers`
- 1253 fertilizantes (17 productores únicos: TIMAC AGRO 281, FERTIBERIA 218, GENÉRICO 139…)
- UI debe ser **buscador con filtros**, no `<select>` plano
- Problemas de calidad: `POTASICO` vs `POTÁSICO` duplicado (normalizar acentos); `type/simple` null en 6.6%; `ecologicProduct` null en 67%
- Factores P↔P₂O₅ (×2.293) y K↔K₂O (×1.205) reconfirmados con datos del catálogo
- Asimetría confirmada: lista usa `cao/mgo/so3/na2o`, detalle individual usa `ca/mg/s/na` — normalizador solo en detalle

### `POST /nutrients/fertilizers/recommendation`
- ✅ Comportamiento del motor: **ajusta N exacto al 100%** del target; P y K se balancean lo mejor posible pero **pueden sobredosificar +96% a +173%** porque la composición fija de los fertilizantes no permite los tres targets simultáneamente
- ✅ `Content-Type: application/json` correcto (a diferencia de `/algo/`)
- ✅ `observations: null` cuando hay propuesta válida (se rellena con texto cuando no se puede)
- ⚠️ **`id: 0`** en todos los productos recomendados — parsear ID real de `links[0].href`
- ⚠️ Máx 5 propuestas por respuesta
- ⚠️ La recomendación es **para el total de la rotación** si pasas un solo `npkToCover`; para recetas por cultivo, una llamada por cultivo
- 3 modos:
  1. Sin `fertilizers[]` → contra catálogo SIEX completo
  2. Con `fertilizers[]` → acotado al stock del agricultor
  3. Con `npkTotal` además de `npkToCover` → cuando parte de la necesidad ya está cubierta

### `sativumarcgis/MapServer/identify` (ArcGIS REST)
- 10 capas conocidas: 0=MO, 1=Textura simplificada, 2=Clasificación textural, 3=Capacidad Campo, 4=Capacidad Retención Agua, 5=pH, 6=P Olsen ppm, 7=K ppm, 8=K agua riego, 9=NO₃ agua riego
- Proxy actual `api/sativum.js` ya implementado (geometría + mapExtent + tolerance + imageDisplay automáticos)
- Resolución espacial 200 m (suficiente para parcelas > 0.5 ha)

---

## Datos auxiliares y unidades confirmadas

| Recurso | Estado | Notas |
|---|---|---|
| `soilTypesSimpl.json` *(Pixel Value 101–106 → enum `soil_type`)* | ✅ guardar en `src/data/sativum/` | Capa 1 → SANDY/SANDY_LOAM/LOAM/SILTY_LOAM/CLAY_LOAM/CLAY |
| `soilTypes.json` *(12 clases USDA → `soilTypeSimplified`)* | ✅ guardar en `src/data/sativum/` | Capa 2 → vía `soilTypeSimplified` agrupa al mismo enum de 6 |
| Tabla `soil_effect.coeff` *(densidad aparente t/m³ por `soil_type`)* | ✅ deducida | SANDY 1.65 · SANDY_LOAM 1.56 · LOAM 1.45 · SILTY_LOAM 1.40 · CLAY_LOAM 1.31 · CLAY 1.20 |
| Unidades CEC = **meq/kg** | ✅ confirmado por UI Sativum | Convertir desde `cmol(+)/kg` o `meq/100g`: ×10 |
| Tabla `p_threshold/k_threshold/efficiency_factor` por `soil_type × strategy` | ⏳ 2 de 24 combinaciones | Defaults transversales mientras llega: `p=12, k=175, factor=1.2` |
| Publicación de CEC como capa del ArcGIS | ⏳ correo pendiente a Luis Carlos | Petición concreta: añadir capa CEC en meq/kg |

---

## Comunicación pendiente con ITACyL

**Correo a Luis Carlos** redactado y listo (no enviado todavía) con una sola petición concreta: **publicar la CEC como capa adicional del servicio `sativumarcgis/MapServer/identify`**, en `meq/kg` (mismas unidades que la UI oficial usa). El resto de incógnitas (tabla de umbrales y factores por `soil_type × strategy`) se aplazan a un correo posterior cuando tengamos más datos reales con los que afinar la pregunta.

---

## Reglas de UX a respetar (visto en UI oficial Sativum)

1. Modo **Parametrización básica** (defaults ocultos) vs **avanzada** (todos los coeficientes editables) — implementar como acordeón "Ajustes del algoritmo" plegado por defecto.
2. Mostrar resultados al agricultor en **kg P₂O₅/ha y kg K₂O/ha** (NO en P/K puros, aunque el API devuelva eso).
3. Etiquetas literales para campos técnicos:
   - "Factor corrección Potasio" = `efficiency_factor.factor`
   - "Umbral Fósforo (ppm)" = `p_threshold.value`
   - "Umbral Potasio (ppm)" = `k_threshold.value`
   - "Tasa máxima Fósforo (kg P/ha)" = `max_p_rate.rate`
   - "Tasa máxima Potasio (kg K/ha)" = `max_k_rate.rate`
   - "N inorgánico final" = `n_end`
   - "N deposición atmosférica, fijación simbiótica…" = `n_other`
   - "N perdido (filtración, volatilización, desnitrificación)" = `n_lost`
   - "N en raíces / N en brotes" = `f_nr`
   - "Beta pl" = `beta_pl`
   - "Efic" = `efic`
4. **Regla del residuo** (campo `fres` en catálogo): si `plantSpeciesGroup=Cereals` y `fres=10`, preguntar "¿se recoge la paja?" → si NO, payload `f_res=100`.
5. **Mostrar deltas pedido vs aplicado** de N/P₂O₅/K₂O en las propuestas de `/recommendation` — clave para que el agricultor entienda la sobredosis de P/K.

---

## Punto de retorno para retomar

1. **`#2`** — configurar `SATIVUM_API_KEY` en Vercel Project Settings → Environment Variables (mismo valor para Production / Preview / Development). Renombrar `api/sativum.js → api/sativum-suelo.js` y actualizar imports en `src/api/`.
2. **`#3`** — crear `api/sativum-crops.js` siguiendo el descriptor de la tarea. Probar con `curl https://fertipro.vercel.app/api/sativum-crops?name=Cebada` desde local.
3. **`#4`** — crear `api/sativum-algo.js` con el defensive parsing y el helper `cultivoSativumToCropFeatures`. Probar con el example1 conocido.
4. **`#5`** — crear `api/sativum-fertilizers.js` con las tres operaciones discriminadas por método/path. Helper `extractFertilizerId`.
5. **`#6 → #10`** — UI agronómica + orquestación + export.

Todos los hallazgos críticos, mappers, conversiones y trampas conocidas están documentados en cada tarea del backlog. Cuando empieces, basta con leer la descripción de la tarea para tener el contexto necesario.

---

## Anexo — referencias externas útiles

- **Portal del desarrollador ITACyL**: `https://portal.api.itacyl.es/portal/`
- **Catálogo API Sativum**: `https://portal.api.itacyl.es/portal/apis/69a926a658a57400012f09fd/documentation/`
- **Soporte Sativum**: `soporte-sativum@itacyl.es`
- **Paper FertiliCalc**: Villalobos et al. (2020) — `Int. J. Plant Production`
- **Guía Sativum 2.1.0** (PDF): el documento oficial con el flujo de 4 pasos
- **Proyecto hermano**: `fertipro-zonas-normativas` (en `C:\work\fertipro-zonas-normativas`) — integrable más adelante para avisos legales ZVN (`#12`)
