/**
 * Logica pura de agrupacion de filas (hojas de cultivo) para agrupar.js.
 * Sin dependencias externas, sin I/O — recibe filas como objetos planos y
 * devuelve la propuesta de grupos. Pensado para poder probarse con datos
 * reales sin tocar Excel (ver lib/test_agrupar.mjs).
 *
 * Reglas acordadas con Miguel (ver CLAUDE.md, seccion "Heuristica de
 * agrupacion" + confirmaciones de la sesion 2026-07-26 cont.):
 *
 * 1. Particion dura (nunca se agrupan filas que no coincidan aqui):
 *    NIF/CIF, Cultivo actual FertiPRO (si ambas lo declaran), Cultivo actual
 *    Sativum (idem), Variedad-patron (veto si ambas la declaran y difiere),
 *    Cultivo anterior FertiPRO/Sativum (idem — veto si ambas la declaran y
 *    difiere), Municipio, Sistema de explotacion, Sistema de cultivo (SIEX).
 *    — Municipio y Sistema de explotacion se anadieron a la particion dura
 *      tras encontrar que "Referencia analisis de suelo" puede ser un texto
 *      generico de procedencia (ej. "Calidad suelo Visual", repetido en las
 *      13 filas de OCEAN ALMOND en 4 municipios distintos) que no implica
 *      homogeneidad real — confirmado por Miguel.
 *    — Sistema de cultivo (SIEX) añadido 2026-07-30, catalogo oficial de 33
 *      valores (aire libre/invernadero/sustratos/hidroponico/entutorados/
 *      mallas/etc., ver build_template.py). Mismo criterio que Sistema de
 *      explotacion: dos parcelas con distinto soporte fisico de cultivo (ej.
 *      invernadero con sustrato vs. aire libre en suelo) cambian tanto el
 *      manejo de agua/nutrientes que nunca deberian compartir hoja de
 *      cultivo, sea cual sea el resto de coincidencias. Puramente
 *      informativo para el calculo — ni FertiPRO ni Sativum tienen hoy
 *      ningun coeficiente que dependa de el.
 *    — Aplicacion destino NO participa en la particion (confirmado por
 *      Miguel: la agrupacion y el nombre del plan son independientes de la
 *      aplicacion destino).
 *    — Cultivo precedente (condicion 3 de la nota MAPA): SI esta en la
 *      particion dura, como veto — ver cultivoAnteriorVeto() mas abajo,
 *      mismo patron permisivo que Variedad-patron (blanco en cualquiera de
 *      los 2 lados nunca veta). Implementado en la sesion 2026-08-04,
 *      cerrando el hueco que habia quedado documentado como pendiente el
 *      2026-07-30 (ver CLAUDE.md, sesion "Cultivo anterior/precedente como
 *      particion dura en agrupar.js"): el cultivo precedente entra
 *      directamente en la formula de N (credito N'yield/N'res, fNR/kim/Fres
 *      del anterior) de los dos motores de calculo, asi que fusionar filas
 *      con precedente distinto obligaria a elegir uno arbitrariamente o
 *      calcular dos balances de N distintos para una misma hoja — mismo
 *      nivel de exigencia (veto) que "el mismo sistema de explotacion",
 *      segun la nota MAPA. Distinto de "tecnicas de cultivo" (condicion 5),
 *      que sigue sin señal dedicada en esta particion.
 *
 * 2. Dentro de un bloque que ya cumple la particion dura, dos filas se
 *    proponen en el mismo grupo si:
 *    a) su Año de plantacion (no vacio) difiere en TOLERANCIA_ANIOS_PLANTACION
 *       años o menos — señal pensada para cultivos leñosos (confirmado por
 *       Miguel): en la practica solo se rellena para leñosos (parcelas
 *       plantadas en campañas cercanas, edad/vigor comparable), asi que no
 *       hace falta comprobar la categoria del cultivo aparte — el campo
 *       vacio en anuales/hortícolas/herbaceos ya desactiva la señal por si
 *       solo. IMPORTANTE (revision 2026-07-26 cont. 3, tras feedback de
 *       Miguel: "no entiendo las agrupaciones... deberiamos agrupar en
 *       Alcanó por variedad+sistema+RANGO de edad similar"): la comparacion
 *       es por PAR de filas (transitiva via union-find), no por año exacto
 *       de todo el grupo — dos filas a 3+ años de distancia SI pueden acabar
 *       en el mismo grupo si hay una fila intermedia que las conecta a
 *       ambas (encadenamiento). El aviso de homogeneidad (punto 3) marca
 *       explicitamente cuando el rango total del grupo ya confirmado supera
 *       la tolerancia, para que quede visible aunque no bloquee, o
 *    b) comparten un mismo valor no vacio en "Referencia analisis de
 *       suelo/agua/enmienda" — PERO SOLO si ese valor discrimina dentro del
 *       bloque (no es compartido por TODAS las filas del bloque). Un valor
 *       constante en todo el bloque no aporta ninguna senal real (es
 *       metadata de procedencia, no evidencia de reutilizar un mismo
 *       analisis) y se ignora como senal de agrupacion, aunque se sigue
 *       mostrando en el detalle.
 *
 * 3. El aviso de homogeneidad se calcula SIEMPRE sobre el grupo ya
 *    propuesto (nunca bloquea, solo avisa): P suelo / K suelo / Materia
 *    organica / Producción objetivo (kg/ha) por rango relativo
 *    (maximo-minimo)/mediana > UMBRAL; Textura FAO por valor distinto dentro
 *    del grupo; Año de plantacion por rango total > TOLERANCIA_ANIOS_PLANTACION
 *    (posible por encadenamiento, ver punto 2a); Fecha fin por año distinto
 *    dentro del grupo (afecta al nombre propuesto).
 *    — Producción objetivo añadida 2026-07-30 (mismo umbral del 25%, sin
 *      necesidad de uno nuevo): entra de forma directa y lineal en la
 *      formula de extraccion de nutrientes de los dos motores (Nyield/Nres
 *      y el resto via la formula G4), asi que un rango grande dentro de un
 *      grupo ya fusionado enmascara una necesidad real distinta por
 *      recinto al agregar por media ponderada de superficie — no es solo
 *      un matiz de "tecnica de cultivo" (condicion 5 de la nota MAPA),
 *      aunque tambien sirve de proxy razonable de eso cuando "Sistema de
 *      cultivo" no distingue la diferencia (ej. dos marcos de plantacion
 *      distintos, ambos "Aire libre").
 */

export const UMBRAL_AVISO_HOMOGENEIDAD = 0.25; // 25% de rango relativo — confirmado por Miguel
export const TOLERANCIA_ANIOS_PLANTACION = 2; // ±2 años — confirmado por Miguel (2026-07-26 cont. 3)

// --------------------------------------------------------------- utilidades
export function normalizarTexto(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function numerico(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Formatea un número a 2 decimales fijos para texto de aviso (evita artefactos
 * de coma flotante tipo "17.399999618530273" en los avisos de homogeneidad). */
function fmt2(v) {
  return Number(v).toFixed(2);
}

/** Año como entero a partir de un valor Date, string "AAAA-MM-DD" o "AAAA". */
export function extraerAnio(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.getFullYear();
  const s = String(v).trim();
  const m = s.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------- particion dura --
/**
 * Compara "Cultivo actual FertiPRO"/"Cultivo actual Sativum" de 2 filas.
 * Compatible si, para cada columna con valor en AMBAS filas, el valor
 * coincide (sin conflictos) y hay al menos una columna comparada con exito
 * (no basta con que las dos tengan todo en blanco).
 */
export function cultivoCompatible(a, b) {
  let algunaComparacion = false;
  for (const campo of ["cultivoFertipro", "cultivoSativum"]) {
    const va = normalizarTexto(a[campo]);
    const vb = normalizarTexto(b[campo]);
    if (va && vb) {
      algunaComparacion = true;
      if (va !== vb) return false;
    }
  }
  return algunaComparacion;
}

function variedadVeto(a, b) {
  const va = normalizarTexto(a.variedad);
  const vb = normalizarTexto(b.variedad);
  if (!va || !vb) return false; // solo veta si AMBAS la declaran
  return va !== vb;
}

/**
 * Cultivo anterior/precedente -- nota aclaratoria del MAPA (23-feb-2026):
 * la hoja de cultivo exige "el mismo cultivo precedente", mismo nivel de
 * exigencia textual que "el mismo sistema de explotación" (partición dura).
 * Compara "Cultivo anterior FertiPRO"/"Cultivo anterior Sativum" columna a
 * columna, igual que cultivoCompatible() -- pero SIN su requisito de
 * "algunaComparacion": el dato no es obligatorio (CONDICIONAL) y, aunque en
 * los ejemplos reales de leñosos de esta plantilla (Almendro, Pistacho) sí
 * se declara -- con el mismo cultivo que el actual, sin rotación real --
 * puede quedar en blanco en otros casos. Blanco en cualquiera de los 2
 * lados nunca veta, mismo patrón permisivo que variedadVeto(); si
 * exigiéramos "alguna comparación" como en cultivoCompatible(), dos filas
 * con las 2 columnas en blanco en ambos lados dejarían de poder fusionarse
 * sin motivo agronómico real.
 */
function cultivoAnteriorVeto(a, b) {
  for (const campo of ["cultivoAnteriorFertipro", "cultivoAnteriorSativum"]) {
    const va = normalizarTexto(a[campo]);
    const vb = normalizarTexto(b[campo]);
    if (va && vb && va !== vb) return true;
  }
  return false;
}

function mismoValorONoDeclarado(a, b, campo) {
  // Municipio / Sistema de explotacion: igualdad exacta (blank===blank cuenta
  // como igual, no discrimina; no forzamos a exigir el dato).
  return normalizarTexto(a[campo]) === normalizarTexto(b[campo]);
}

/** true si a y b pueden ir en el mismo bloque (particion dura superada). */
function pasaParticionDura(a, b) {
  if (normalizarTexto(a.nif) !== normalizarTexto(b.nif)) return false;
  if (!cultivoCompatible(a, b)) return false;
  if (variedadVeto(a, b)) return false;
  if (cultivoAnteriorVeto(a, b)) return false;
  if (!mismoValorONoDeclarado(a, b, "municipio")) return false;
  if (!mismoValorONoDeclarado(a, b, "sistemaExplotacion")) return false;
  if (!mismoValorONoDeclarado(a, b, "sistemaCultivo")) return false;
  return true;
}

// ------------------------------------------------------------ union-find --
class UnionFind {
  constructor(n) {
    this.padre = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    while (this.padre[i] !== i) {
      this.padre[i] = this.padre[this.padre[i]];
      i = this.padre[i];
    }
    return i;
  }
  union(i, j) {
    const ri = this.find(i);
    const rj = this.find(j);
    if (ri !== rj) this.padre[ri] = rj;
  }
}

function clustersDeUnionFind(indices, find) {
  const clusters = new Map();
  for (const i of indices) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }
  return [...clusters.values()];
}

// ------------------------------------------------ REFERENCIAS COMPARTIDAS --
const CAMPOS_REFERENCIA = ["refSuelo", "refAgua", "refEnmienda"];

/**
 * Para un bloque (indices de filas que ya pasan la particion dura), decide
 * que valores de referencia SI discriminan (no son constantes en todo el
 * bloque) y devuelve, por cada campo discriminante, un mapa valor -> indices.
 */
function referenciasDiscriminantes(filas, indicesBloque) {
  const resultado = [];
  for (const campo of CAMPOS_REFERENCIA) {
    const porValor = new Map();
    let totalConValor = 0;
    for (const i of indicesBloque) {
      const v = normalizarTexto(filas[i][campo]);
      if (!v) continue;
      totalConValor++;
      if (!porValor.has(v)) porValor.set(v, []);
      porValor.get(v).push(i);
    }
    if (totalConValor === 0) continue;
    const valoresDistintos = [...porValor.keys()];
    const esConstante = valoresDistintos.length === 1 && totalConValor === indicesBloque.length;
    if (esConstante) continue; // no discrimina — se ignora como señal (ej. "Calidad suelo Visual")
    for (const [valor, idxs] of porValor) {
      if (idxs.length >= 2) resultado.push({ campo, valor, idxs });
    }
  }
  return resultado;
}

// --------------------------------------------------------------- bloques --
/** Particiona TODAS las filas en bloques que cumplen la particion dura. */
export function construirBloques(filas) {
  const n = filas.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pasaParticionDura(filas[i], filas[j])) uf.union(i, j);
    }
  }
  return clustersDeUnionFind(filas.map((_, i) => i), (i) => uf.find(i));
}

/**
 * Dentro de un bloque, forma sub-grupos por (a) mismo Año de plantacion o
 * (b) referencia compartida discriminante. Filas sin ninguna coincidencia
 * quedan como grupo de 1.
 */
export function agruparDentroDeBloque(filas, indicesBloque) {
  const posicion = new Map(indicesBloque.map((idx, k) => [idx, k]));
  const uf = new UnionFind(indicesBloque.length);
  const senalPorPar = new Map(); // "k1-k2" -> lista de señales aplicadas (informativo)

  const marcaSenal = (kA, kB, texto) => {
    const key = kA < kB ? `${kA}-${kB}` : `${kB}-${kA}`;
    if (!senalPorPar.has(key)) senalPorPar.set(key, []);
    senalPorPar.get(key).push(texto);
  };

  // (a) Año de plantación dentro de una ventana de tolerancia (no exige año
  // exacto — ver TOLERANCIA_ANIOS_PLANTACION). Comparacion por PAR: dos filas
  // se unen si su diferencia de años cae dentro de la tolerancia; el
  // encadenamiento transitivo del union-find puede acabar fusionando filas
  // mas separadas entre si que la tolerancia (ej. 2013-2015-2016 con
  // tolerancia ±2) — el aviso de homogeneidad (calcularAvisoHomogeneidad)
  // marca esos casos explicitamente.
  const conAnio = indicesBloque
    .map((idx) => ({ idx, anio: extraerAnio(filas[idx].anioPlantacion) }))
    .filter((x) => x.anio !== null);
  for (let a = 0; a < conAnio.length; a++) {
    for (let b = a + 1; b < conAnio.length; b++) {
      const { idx: idxA, anio: anioA } = conAnio[a];
      const { idx: idxB, anio: anioB } = conAnio[b];
      if (Math.abs(anioA - anioB) <= TOLERANCIA_ANIOS_PLANTACION) {
        uf.union(posicion.get(idxA), posicion.get(idxB));
        const texto = anioA === anioB
          ? `Año de plantación ${anioA}`
          : `Año de plantación ${anioA}~${anioB} (≤${TOLERANCIA_ANIOS_PLANTACION} años)`;
        marcaSenal(posicion.get(idxA), posicion.get(idxB), texto);
      }
    }
  }

  // (b) referencia compartida discriminante
  const refs = referenciasDiscriminantes(filas, indicesBloque);
  for (const { campo, valor, idxs } of refs) {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        uf.union(posicion.get(idxs[a]), posicion.get(idxs[b]));
        marcaSenal(posicion.get(idxs[a]), posicion.get(idxs[b]), `${campo}="${valor}"`);
      }
    }
  }

  const clustersPorRaiz = new Map();
  for (const idx of indicesBloque) {
    const r = uf.find(posicion.get(idx));
    if (!clustersPorRaiz.has(r)) clustersPorRaiz.set(r, []);
    clustersPorRaiz.get(r).push(idx);
  }

  return [...clustersPorRaiz.values()].map((idxs) => {
    const senales = new Set();
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const key = posicion.get(idxs[a]) < posicion.get(idxs[b])
          ? `${posicion.get(idxs[a])}-${posicion.get(idxs[b])}`
          : `${posicion.get(idxs[b])}-${posicion.get(idxs[a])}`;
        for (const s of senalPorPar.get(key) || []) senales.add(s);
      }
    }
    return { indices: idxs, senal: idxs.length > 1 ? [...senales].join(" + ") : "sin coincidencias (fila única)" };
  });
}

// ------------------------------------------------------- homogeneidad ----
function rangoRelativo(valores) {
  const nums = valores.filter((v) => v !== null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const ordenados = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 ? ordenados[mid] : (ordenados[mid - 1] + ordenados[mid]) / 2;
  if (mediana === 0) return max - min > 0 ? Infinity : 0;
  return (max - min) / mediana;
}

const CAMPOS_HOMOGENEIDAD_NUMERICOS = [
  { campo: "pSuelo", etiqueta: "P suelo" },
  { campo: "kSuelo", etiqueta: "K suelo" },
  { campo: "materiaOrganica", etiqueta: "Materia orgánica" },
  { campo: "produccionObjetivo", etiqueta: "Producción objetivo (kg/ha)" },
];

export function calcularAvisoHomogeneidad(filasGrupo) {
  const avisos = [];

  for (const { campo, etiqueta } of CAMPOS_HOMOGENEIDAD_NUMERICOS) {
    const valores = filasGrupo.map((f) => numerico(f[campo]));
    const rango = rangoRelativo(valores);
    if (rango !== null && rango > UMBRAL_AVISO_HOMOGENEIDAD) {
      const nums = valores.filter((v) => v !== null);
      avisos.push(
        `${etiqueta}: ${fmt2(Math.min(...nums))}–${fmt2(Math.max(...nums))} ` +
        `(rango relativo ${Math.round(rango * 100)}%, umbral ${Math.round(UMBRAL_AVISO_HOMOGENEIDAD * 100)}%)`
      );
    }
  }

  const texturas = new Set(filasGrupo.map((f) => normalizarTexto(f.texturaFao)).filter(Boolean));
  if (texturas.size > 1) {
    avisos.push(`Textura FAO distinta dentro del grupo: ${[...texturas].join(" / ")}`);
  }

  const anios = new Set(filasGrupo.map((f) => extraerAnio(f.fechaFin)).filter((a) => a !== null));
  if (anios.size > 1) {
    avisos.push(`Fecha fin de ciclo con año distinto dentro del grupo: ${[...anios].join(" / ")}`);
  }

  const aniosPlantacion = filasGrupo.map((f) => extraerAnio(f.anioPlantacion)).filter((a) => a !== null);
  if (aniosPlantacion.length >= 2) {
    const minA = Math.min(...aniosPlantacion);
    const maxA = Math.max(...aniosPlantacion);
    if (maxA - minA > TOLERANCIA_ANIOS_PLANTACION) {
      avisos.push(
        `Año de plantación: rango ${minA}-${maxA} (${maxA - minA} años) — por encima de la ` +
        `tolerancia ±${TOLERANCIA_ANIOS_PLANTACION} usada para agrupar (fusión encadenada entre filas intermedias)`
      );
    }
  }

  return avisos.join(" | ");
}

// ------------------------------------------------ nombre plan de abonado --
function anioModaFechaFin(filasGrupo) {
  const conteo = new Map();
  for (const f of filasGrupo) {
    const a = extraerAnio(f.fechaFin);
    if (a === null) continue;
    conteo.set(a, (conteo.get(a) || 0) + 1);
  }
  if (conteo.size === 0) return null;
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function cultivoParaNombre(filasGrupo) {
  const f = filasGrupo[0];
  const c = normalizarTexto(f.cultivoFertipro) || normalizarTexto(f.cultivoSativum);
  return c || null;
}

/**
 * Calcula "Nombre plan de abonado" = AAAA-MUNICIPIO-CULTIVO-NN.
 * `nn` ya debe venir resuelto (correlativo por Titular, ver orquestador).
 * Devuelve { nombre, error } — error !== null si falta AAAA o CULTIVO
 * (no se genera un nombre a medias).
 *
 * También devuelve las piezas sueltas ya limpias (anio/cultivoLimpio/
 * municipioLimpio/nn) — calcular.js las usa para construir el nombre de
 * FICHERO protegiendo año/municipio/NN del recorte a 90 caracteres y
 * dejando que el recorte, si hace falta, se coma solo el cultivo (decisión
 * de Miguel, sesión 2026-07-29: el municipio es el distintivo visual de la
 * carpeta de salidas, el nombre completo del cultivo ya se ve dentro del
 * propio Excel). El campo `nombre` (para el Excel/app) nunca se trunca.
 * Orden Municipio-antes-que-Cultivo (cambiado 2026-08-04, decisión de
 * Miguel): agrupa visualmente por geografía al ordenar alfabéticamente,
 * mismo criterio ya usado en el nombre de fichero de salidas/ (NIF primero).
 *
 * Sufijo `-agru` (añadido 2026-08-04): se añade al final del nombre solo
 * cuando el grupo es una fusión real (más de 1 fila) — para distinguir a
 * simple vista, en una lista larga de "Nombre plan de abonado (propuesta)",
 * qué planes son de verdad el resultado de fusionar varias hojas de cultivo
 * frente a los que siempre fueron (o pasaron a ser, vía "Generar sin
 * agrupar") una sola fila. También se devuelve `esFusion` (booleano) para
 * que el llamador (nombreFicheroSeguroDesdeGrupo() en calcular.js) pueda
 * aplicar el mismo sufijo al nombre de FICHERO.
 */
export function calcularNombrePlan(filasGrupo, nn) {
  const anio = anioModaFechaFin(filasGrupo);
  const cultivo = cultivoParaNombre(filasGrupo);
  const municipioRaw = normalizarTexto(filasGrupo[0].municipio);
  const esFusion = filasGrupo.length > 1;

  if (cultivo === null) {
    return { nombre: null, error: "Falta Cultivo actual (FertiPRO y Sativum vacíos) — no se puede generar nombre", avisoMunicipio: null, anio: null, cultivoLimpio: null, municipioLimpio: null, nn: null, esFusion };
  }
  if (anio === null) {
    return { nombre: null, error: "Falta año de 'Fecha fin' en todas las filas del grupo — no se puede generar nombre", avisoMunicipio: null, anio: null, cultivoLimpio: null, municipioLimpio: null, nn: null, esFusion };
  }

  const municipio = municipioRaw ? municipioRaw : "MUN";
  // El aviso deja claro DÓNDE corregir -- editar "Nombre plan de abonado
  // (propuesta)" a mano en revision/*.xlsx no basta: el nombre de FICHERO
  // se construye aparte, desde las columnas "... (nombre fichero)" (ver
  // nombreFicheroSeguroDesdeGrupo() en calcular.js), que solo se rellenan
  // corriendo agrupar.js de nuevo -- confusión real de Miguel en sesión
  // 2026-07-30 (editó la celda de texto, el nombre de fichero siguió con
  // "MUN"), aviso reescrito para que no se repita.
  const avisoMunicipio = municipioRaw
    ? null
    : "Municipio vacío — se usó 'MUN'. Corrígelo en la plantilla de casos/ y vuelve a "
      + "ejecutar agrupar.js; editar esta celda aquí no actualiza el nombre del fichero.";

  const limpia = (s) => s.replace(/\s+/g, " ").trim().toUpperCase();
  const cultivoLimpio = limpia(cultivo);
  const municipioLimpio = limpia(municipio);
  const nnStr = String(nn).padStart(2, "0");
  const nombre = `${anio}-${municipioLimpio}-${cultivoLimpio}-${nnStr}${esFusion ? "-agru" : ""}`;
  return { nombre, error: null, avisoMunicipio, anio, cultivoLimpio, municipioLimpio, nn: nnStr, esFusion };
}

// --------------------------------------------------------- orquestador --
/**
 * Punto de entrada: filas -> propuesta de grupos.
 * `filas` es un array de objetos con, al menos, los campos usados arriba
 * (nif, cultivoFertipro, cultivoSativum, variedad, municipio,
 * sistemaExplotacion, anioPlantacion, refSuelo/refAgua/refEnmienda,
 * pSuelo/kSuelo/materiaOrganica/texturaFao, fechaFin) mas lo que el llamador
 * quiera propagar para trazabilidad (ficheroOrigen, filaOrigen, ref, etc.).
 */
export function agruparFilas(filas) {
  const bloques = construirBloques(filas);
  const grupos = [];
  for (const bloque of bloques) {
    const subgrupos = agruparDentroDeBloque(filas, bloque);
    for (const { indices, senal } of subgrupos) {
      grupos.push({ indices, senal, filas: indices.map((i) => filas[i]) });
    }
  }

  // Orden determinista: Titular, Municipio, Cultivo, primera Ref. hoja de
  // cultivo alfabetica dentro del grupo — para que el correlativo NN sea lo
  // mas estable posible entre ejecuciones sucesivas. Municipio antes que
  // Cultivo (cambiado 2026-08-25, decision de Miguel): agrupa visualmente
  // por geografia al asignar el NN, mismo criterio ya aplicado el 2026-08-04
  // al campo "Nombre plan de abonado" (AAAA-MUNICIPIO-CULTIVO-NN) -- antes
  // de este cambio el nombre ya leia "por municipio" pero el NN se seguia
  // repartiendo por cultivo, un hueco que se quedo fuera del blast radius de
  // aquel cambio. No afecta a la fusion de filas en grupos (Año de
  // plantacion, ref de suelo/agua/enmienda) ni al aviso de homogeneidad --
  // solo al orden/numeracion de los grupos ya formados.
  const claveOrden = (g) => {
    const f = g.filas[0];
    const refs = g.filas.map((x) => normalizarTexto(x.ref)).sort();
    return [normalizarTexto(f.nif), normalizarTexto(f.municipio), cultivoParaNombre(g.filas) || "", refs[0] || ""].join("|");
  };
  grupos.sort((a, b) => (claveOrden(a) < claveOrden(b) ? -1 : claveOrden(a) > claveOrden(b) ? 1 : 0));

  const contadorPorTitular = new Map();
  return grupos.map((g, i) => {
    const nif = normalizarTexto(g.filas[0].nif);
    const nn = (contadorPorTitular.get(nif) || 0) + 1;
    contadorPorTitular.set(nif, nn);
    const { nombre, error, avisoMunicipio, anio, cultivoLimpio, municipioLimpio, nn: nnStr } = calcularNombrePlan(g.filas, nn);
    const avisoHomogeneidad = calcularAvisoHomogeneidad(g.filas);
    const aviso = [avisoMunicipio, avisoHomogeneidad].filter(Boolean).join(" | ");
    return {
      grupoId: `Grupo ${i + 1}`,
      nFilas: g.filas.length,
      senal: g.senal,
      filas: g.filas,
      nombrePropuesto: nombre,
      errorNombre: error,
      aviso,
      // piezas sueltas para el nombre de fichero cultivo-truncado (ver calcular.js)
      anioNombre: anio,
      cultivoNombre: cultivoLimpio,
      municipioNombre: municipioLimpio,
      nnNombre: nnStr,
    };
  });
}
