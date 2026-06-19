# FertiPRO

**Simulador web de planificación de abonado para cultivos agrícolas españoles.**

Calcula las necesidades de fertilización NPK usando el motor **FertiliCalc** (F. Villalobos, ITACyL), selecciona fertilizantes del catálogo Sativum y genera un plan de aplicaciones exportable en Excel y PDF.

🌐 **Producción:** <https://fertipro.vercel.app>

---

## ¿Qué hace FertiPRO?

FertiPRO está pensado para **asesores agrícolas y técnicos** que necesitan elaborar planes de abonado conformes al RD 1051/2022 (Programa de Actuación de Zonas Vulnerables a Nitratos). El flujo de trabajo es:

1. **Localiza la parcela** — dibuja un polígono libre, carga un GeoJSON/shapefile o pincha directamente en el mapa. FertiPRO recupera automáticamente los recintos SIGPAC que intersectan la geometría, con superficie, uso del suelo, coeficiente de regadío y clasificación ZVN.

2. **Identifica el suelo** — consulta en tiempo real la capa de suelos de ITACyL (ArcGIS) para obtener textura, materia orgánica, pH, P Olsen, K y conductividad eléctrica del agua de riego.

3. **Configura el cultivo** — selecciona el cultivo actual y el precedente en la rotación, el rendimiento objetivo, la estrategia de abonado y el manejo de residuos.

4. **Calcula las necesidades NPK** — el motor FertiliCalc (API Sativum/ITACyL) devuelve las unidades fertilizantes brutas N, P₂O₅ y K₂O, descontando automáticamente los aportes del agua de riego.

5. **Construye el plan de aplicaciones** — añade propuestas del catálogo Sativum (1 253 productos) o fertilizantes del asesor. Los productos orgánicos aplican la mineralización anual (yearPercent) según su categoría SIEX. Las barras de cobertura muestran el porcentaje cubierto en tiempo real.

6. **Exporta** — descarga el plan en Excel (hojas Plan, Fertilizantes, Recintos SIGPAC y Notas) o en PDF con el formato del informe oficial Sativum.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite 5 + React 18 |
| Mapa | Leaflet 1.9 + leaflet-geoman (dibujo de polígonos) |
| Geoprocesamiento | @turf/area, @turf/centroid, @turf/intersect |
| Backend (proxies) | Vercel Serverless Functions (`/api/*.js`) |
| Exportación Excel | SheetJS (xlsx 0.18.5, Apache-2.0) |
| Exportación PDF | jsPDF 4 + jsPDF-AutoTable 5 (MIT) |
| SIGPAC | OGC API Features + REST recinfo/nitratos (FEGA HubCloud) |
| Suelo | ArcGIS MapServer (Sativum/ITACyL) |
| Motor NPK | API REST FertiliCalc (Sativum/ITACyL) |

---

## Arranque local

### Requisitos previos

- **Node.js** ≥ 18
- **npm** ≥ 9
- Cuenta en el [Portal del desarrollador del ITACyL](https://portal.api.itacyl.es/portal/) con una `SATIVUM_API_KEY` activa

### Instalación

```powershell
git clone https://github.com/<tu-usuario>/fertipro-api-sativum.git
cd fertipro-api-sativum
npm install
```

### Variables de entorno

Crea un fichero `.env.local` en la raíz del proyecto:

```
SATIVUM_API_KEY=tu_clave_aqui
```

> **Nota de seguridad:** esta clave **nunca** debe llegar al cliente. Solo se usa dentro de las funciones serverless (`/api/*.js`). No la incluyas en el código ni en el repositorio.

### Modo desarrollo sin funciones serverless

```powershell
npm run dev
```

Arranca el servidor de Vite en `http://localhost:5173`. Las llamadas a `/api/*` se redirigen automáticamente al deploy de producción mediante el proxy configurado en `vite.config.js`, por lo que el frontend funciona sin Vercel CLI.

> ⚠️ En este modo las peticiones a la API Sativum van al proxy de producción (fertipro.vercel.app). Para trabajar con tu propia clave en local usa el modo Vercel CLI.

### Modo desarrollo completo (con funciones serverless)

Requiere tener la [Vercel CLI](https://vercel.com/docs/cli) instalada y haber enlazado el proyecto:

```powershell
npx vercel login       # solo la primera vez o cuando caduca el token
npx vercel link        # enlaza con tu proyecto Vercel (solo la primera vez)
npx vercel dev         # arranca frontend + funciones en http://localhost:3000
```

Con `vercel dev` la variable `SATIVUM_API_KEY` se lee de tu proyecto Vercel (o de `.env.local`).

### Verificar build antes de publicar

```powershell
npm run build
```

---

## Despliegue en producción

FertiPRO se despliega automáticamente en [Vercel](https://vercel.com) al hacer push a la rama principal:

```powershell
git add .
git commit -m "descripción del cambio"
git push
```

Vercel recompila y republica en 2–3 minutos. No hay ningún paso manual adicional.

### Variables de entorno en Vercel

Configura la siguiente variable en **Vercel → tu proyecto → Settings → Environment Variables**:

| Variable | Descripción |
|----------|-------------|
| `SATIVUM_API_KEY` | API key del portal ITACyL. Obligatoria para el cálculo NPK y la consulta de suelos. |

SIGPAC HubCloud no requiere clave: sus endpoints son públicos.

---

## Estructura del repositorio

```
fertipro-api-sativum/
├── api/                          Funciones serverless Vercel (proxies)
│   ├── sativum-algo.js             POST /fertilicalc/algo/ — cálculo NPK
│   ├── sativum-fertilizers.js      GET/POST /nutrients/fertilizers — catálogo y recomendación
│   ├── sativum-crops.js            GET /nutrients/crops — catálogo de cultivos
│   ├── sativum-suelo.js            GET ArcGIS identify — características del suelo
│   ├── sigpac.js                   GET OGC API Features — recinto en un punto
│   ├── sigpac-bbox.js              GET OGC API Features — recintos en bbox
│   ├── sigpac-recinfo.js           GET REST recinfo — uso, coef. regadío, superficie
│   └── sigpac-zvn.js               GET REST nitratos — clasificación ZVN
├── public/
│   └── fertipro.png              Logo de la aplicación (usado en cabecera PDF)
├── src/
│   ├── api/                      Wrappers cliente de los proxies serverless
│   ├── components/               Componentes React (paneles, tarjetas, diálogos)
│   ├── cultivos/                 Selector de cultivo (CultivoSelector)
│   ├── data/sativum/             Tablas estáticas (tipos SIEX, fuentes agua, algoParams)
│   ├── map/                      MapPicker — Leaflet + leaflet-geoman
│   └── utils/                    exportExcel.js, exportPdf.js, geometry.js, recintosInterseccion.js
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Fuentes de datos y licencias

### Motor de cálculo — FertiliCalc / API Sativum (ITACyL)

El cálculo de necesidades NPK se realiza mediante el **servicio público FertiliCalc** de la API Sativum, desarrollado por el **Instituto Tecnológico Agrario de Castilla y León (ITACyL)** en el marco del convenio de colaboración con el Fondo Español de Garantía Agraria (FEGA). Este servicio es de acceso público para terceros y requiere una API key obtenida en el [Portal del desarrollador del ITACyL](https://portal.api.itacyl.es/portal/).

Los perfiles agronómicos de algunos cultivos (remolacha, girasol, soja) han sido revisados en el proyecto **ACORSAT**, financiado por FEADER (Submedida 16.2 PDR CyL).

© Instituto Tecnológico Agrario de Castilla y León — Junta de Castilla y León · [sativum.es](https://www.sativum.es)

### Datos de suelo — ArcGIS MapServer (ITACyL)

Las características edafológicas (textura, materia orgánica, pH, P Olsen, K, conductividad eléctrica) proceden del **Visor de Suelos de Castilla y León** de ITACyL, accesibles a través de su servicio ArcGIS REST. Requiere la misma API key que el motor FertiliCalc.

Fuente: [suelos.itacyl.es](https://suelos.itacyl.es) · © ITACyL — Junta de Castilla y León

### Recintos SIGPAC — FEGA (MAPA)

Los datos de recintos, geometrías, usos del suelo, coeficientes de regadío y Zonas Vulnerables a Nitratos (ZVN) proceden del **Sistema de Información Geográfica de Parcelas Agrícolas (SIGPAC)**, gestionado por el **Fondo Español de Garantía Agraria (FEGA)** del Ministerio de Agricultura, Pesca y Alimentación.

Distribuidos como **Datos de Alto Valor (HVD)** bajo licencia **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es)** conforme al Reglamento de Implementación UE 2023/138.

Endpoint: [sigpac-hubcloud.es](https://sigpac-hubcloud.es) · Fuente: FEGA — MAPA

### Ortofoto base — PNOA (IGN)

La capa de ortofoto base del mapa procede del **Plan Nacional de Ortofotografía Aérea (PNOA) Máxima Actualidad**, producido por el **Instituto Geográfico Nacional (IGN)** del Ministerio de Fomento.

Licencia: **CC BY 4.0** · © Instituto Geográfico Nacional de España · [ign.es](https://www.ign.es)

### Normativa de referencia

La clasificación de Zonas Vulnerables a Nitratos (ZVN) y los tipos de material fertilizante (SIEX) se basan en el **Real Decreto 1051/2022**, de 27 de diciembre, por el que se establecen normas para la nutrición sostenible en los suelos agrícolas.

### Dependencias de código abierto

| Librería | Versión | Licencia |
|----------|---------|----------|
| Leaflet | 1.9.4 | BSD-2-Clause |
| @geoman-io/leaflet-geoman-free | 2.19.3 | MIT |
| @turf/* | 7.x | MIT |
| jsPDF | 4.x | MIT |
| jsPDF-AutoTable | 5.x | MIT |
| SheetJS (xlsx) | 0.18.5 | Apache-2.0 |
| React | 18.x | MIT |
| Vite | 5.x | MIT |

---

## Referencia académica

El motor de cálculo FertiliCalc está basado en la metodología descrita en:

> **Villalobos, F.J., Testi, L., Rizzalli, R., García-García, J.M. y Orgaz, F.** (2020). *Fitotecnia: principios de agronomía para una agricultura sostenible* (2.ª ed.). Mundi-Prensa, Madrid.

Si utilizas FertiPRO en un contexto académico o técnico, cita también la fuente del servicio:

> **ITACyL — Instituto Tecnológico Agrario de Castilla y León** (2024). *Sativum: servicios digitales para la nutrición de cultivos*. [https://www.sativum.es](https://www.sativum.es)

---

## Licencia del proyecto

El código fuente de FertiPRO es propiedad de **VisualNacert**. Todos los derechos reservados.

Los datos y servicios externos usados por la aplicación están sujetos a sus propias condiciones de uso, detalladas en la sección anterior.
