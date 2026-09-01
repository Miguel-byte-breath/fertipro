// -*- coding: utf-8 -*-
/**
 * valores.js — helpers de parseo compartidos por agregarGrupo.js/calcular.js.
 * Independientes de exceljs — trabajan sobre los valores ya extraídos por
 * leerCasos.js (pueden venir como number, string, Date o null).
 */

export function toNum(v) {
  if (v === null || v === undefined || v === "" || v === "—") return null;
  if (v instanceof Date) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function toStr(v) {
  if (v === null || v === undefined || v === "—") return "";
  if (v instanceof Date) return isoDesdeFecha(v);
  return String(v).trim();
}

export function toBoolSiNo(v) {
  const s = toStr(v).toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1";
}

/** Convierte una celda de fecha de Excel (Date o serial o "DD-MM-AAAA"/ISO) a "AAAA-MM-DD". */
export function toIsoFecha(v) {
  if (v === null || v === undefined || v === "" || v === "—") return null;
  if (v instanceof Date) return isoDesdeFecha(v);
  const s = String(v).trim();
  // AAAA-MM-DD ya viene así
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-AAAA (formato usado en "Fecha de plantación / siembra")
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function isoDesdeFecha(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Media ponderada por peso (ignora entradas con valor null); null si no hay ninguna. */
export function mediaPonderada(pares) {
  // pares: [{ valor, peso }]
  const validos = pares.filter((p) => p.valor !== null && p.valor !== undefined && Number.isFinite(p.valor));
  if (validos.length === 0) return null;
  const pesoTotal = validos.reduce((s, p) => s + (p.peso || 0), 0);
  if (pesoTotal <= 0) {
    // Sin superficie declarada en ninguna fila: media aritmética simple, no ponderada.
    return validos.reduce((s, p) => s + p.valor, 0) / validos.length;
  }
  return validos.reduce((s, p) => s + p.valor * (p.peso || 0), 0) / pesoTotal;
}

/** Valor categórico más frecuente entre los no vacíos; null si no hay ninguno. */
export function modaTexto(valores) {
  const noVacios = valores.map(toStr).filter((v) => v !== "");
  if (noVacios.length === 0) return null;
  const conteo = new Map();
  for (const v of noVacios) conteo.set(v, (conteo.get(v) || 0) + 1);
  let mejor = noVacios[0];
  let mejorN = 0;
  for (const [v, n] of conteo) {
    if (n > mejorN) {
      mejor = v;
      mejorN = n;
    }
  }
  return mejor;
}
