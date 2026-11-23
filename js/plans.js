// Lógica pura de planes: validación/normalización del archivo de Claude y resolución por fecha.
// No toca la base de datos: así se puede probar de forma aislada (ver tests/).
import { WEEKDAYS, isValidISO, normalizeWeekday, diffDays, startOfWeek, addDays, weekdayKey } from './dates.js';

export const PLAN_TYPE = 'fitcoach-plan';
export const PLAN_VERSION = 1;
export const HITO_TYPES = ['inicio', 'fin', 'fotos', 'pesaje', 'perimetros', 'revision', 'otro'];
const REST_WORDS = ['descanso', 'rest', 'libre', 'off', '-', ''];

/** Extrae el JSON de un texto (admite bloques ```json ... ``` y texto alrededor). */
export function extractJSON(text) {
  if (typeof text !== 'string') throw new Error('No hay texto que procesar');
  let t = text.trim().replace(/^﻿/, '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No se encontró ningún objeto JSON');
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    throw new Error(`El JSON no es válido: ${e.message}`);
  }
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (v == null ? '' : String(v).trim());

/** Convierte `semana` (objeto) o `semanas` (array) en array de semanas {lunes: id|null, ...}. */
function normalizeWeeks(section, resolveId, label, errors) {
  let weeks = section.semanas ?? (section.semana ? [section.semana] : null);
  if (!weeks) return null;
  if (!Array.isArray(weeks)) weeks = [weeks];
  return weeks.map((w, wi) => {
    const out = Object.fromEntries(WEEKDAYS.map((d) => [d, null]));
    if (typeof w !== 'object' || w === null) {
      errors.push(`${label}: la semana ${wi + 1} no es un objeto`);
      return out;
    }
    for (const [k, v] of Object.entries(w)) {
      const day = normalizeWeekday(k);
      if (!day) { errors.push(`${label}: "${k}" no es un día de la semana`); continue; }
      if (v == null) continue;
      const ref = str(v);
      // Primero se busca una sesión/tipo de día con ese id o nombre (p. ej. un tipo de dieta "descanso");
      // solo si no existe se interpreta como día libre.
      const id = ref ? resolveId(ref) : null;
      if (id) { out[day] = id; continue; }
      if (REST_WORDS.includes(ref.toLowerCase())) continue;
      errors.push(`${label}: el ${day} apunta a "${v}", que no existe`);
    }
    return out;
  });
}

function makeResolver(items) {
  return (ref) => {
    if (items[ref]) return ref;
    const s = slug(ref);
    const found = Object.values(items).find((it) => slug(it.id) === s || slug(it.nombre) === s);
    return found ? found.id : null;
  };
}

function normalizeRutina(r, errors, warnings) {
  const L = 'Rutina';
  if (typeof r !== 'object' || r === null) { errors.push(`${L}: debe ser un objeto`); return null; }
  const out = {
    nombre: str(r.nombre) || 'Rutina sin nombre',
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin || null,
    notas: str(r.notas),
    sesiones: {},
    semanas: [],
  };
  if (!isValidISO(out.fechaInicio)) errors.push(`${L}: "fechaInicio" debe tener formato AAAA-MM-DD`);
  if (out.fechaFin && !isValidISO(out.fechaFin)) errors.push(`${L}: "fechaFin" debe tener formato AAAA-MM-DD`);
  if (out.fechaFin && isValidISO(out.fechaInicio) && out.fechaFin < out.fechaInicio) errors.push(`${L}: "fechaFin" es anterior a "fechaInicio"`);

  if (!Array.isArray(r.sesiones) || !r.sesiones.length) {
    errors.push(`${L}: "sesiones" debe ser una lista con al menos una sesión`);
    return out;
  }
  r.sesiones.forEach((s, i) => {
    const id = str(s.id) || slug(s.nombre || `sesion-${i + 1}`);
    if (out.sesiones[id]) errors.push(`${L}: id de sesión repetido "${id}"`);
    if (!Array.isArray(s.ejercicios) || !s.ejercicios.length) {
      errors.push(`${L}: la sesión "${s.nombre || id}" no tiene ejercicios`);
    }
    out.sesiones[id] = {
      id,
      nombre: str(s.nombre) || id,
      notas: str(s.notas),
      calentamiento: str(s.calentamiento),
      ejercicios: (s.ejercicios || []).map((e, j) => {
        if (typeof e !== 'object' || !str(e.nombre)) errors.push(`${L}: ejercicio ${j + 1} de "${s.nombre || id}" sin nombre`);
        const series = Math.round(num(e.series) ?? 0);
        if (!(series > 0)) errors.push(`${L}: "${e.nombre || j + 1}" necesita "series" > 0`);
        return {
          nombre: str(e.nombre),
          series: series || 1,
          reps: str(e.reps) || '-',
          descansoSeg: num(e.descansoSeg) ?? 90,
          peso: num(e.peso),
          rir: str(e.rir),
          tempo: str(e.tempo),
          notas: str(e.notas),
          superserie: str(e.superserie),
        };
      }),
    };
  });
  const weeks = normalizeWeeks(r, makeResolver(out.sesiones), L, errors);
  if (!weeks) errors.push(`${L}: falta "semana" (qué sesión toca cada día)`);
  else out.semanas = weeks;
  if (weeks && weeks.every((w) => WEEKDAYS.every((d) => !w[d]))) warnings.push(`${L}: ningún día tiene entrenamiento asignado`);
  return out;
}

function normalizeAlimento(a, ctx, errors) {
  if (typeof a === 'string') return { nombre: a.trim(), cantidad: null, unidad: '', categoria: 'Otros', notas: '' };
  if (typeof a !== 'object' || a === null || !str(a.nombre)) {
    errors.push(`Dieta: alimento sin nombre en ${ctx}`);
    return { nombre: '?', cantidad: null, unidad: '', categoria: 'Otros', notas: '' };
  }
  return {
    nombre: str(a.nombre),
    cantidad: num(a.cantidad),
    unidad: str(a.unidad),
    categoria: str(a.categoria) || 'Otros',
    notas: str(a.notas),
  };
}

function normalizeDieta(d, errors, warnings) {
  const L = 'Dieta';
  if (typeof d !== 'object' || d === null) { errors.push(`${L}: debe ser un objeto`); return null; }
  const o = d.objetivos || {};
  const out = {
    nombre: str(d.nombre) || 'Dieta sin nombre',
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin || null,
    notas: str(d.notas),
    objetivos: {
      kcal: num(o.kcal), proteina: num(o.proteina), carbohidratos: num(o.carbohidratos),
      grasas: num(o.grasas), aguaMl: num(o.aguaMl),
    },
    tiposDia: {},
    semanas: [],
  };
  if (!isValidISO(out.fechaInicio)) errors.push(`${L}: "fechaInicio" debe tener formato AAAA-MM-DD`);
  if (out.fechaFin && !isValidISO(out.fechaFin)) errors.push(`${L}: "fechaFin" debe tener formato AAAA-MM-DD`);

  const tipos = d.tiposDia;
  if (!Array.isArray(tipos) || !tipos.length) {
    errors.push(`${L}: "tiposDia" debe ser una lista con al menos un tipo de día`);
    return out;
  }
  tipos.forEach((t, i) => {
    const id = str(t.id) || slug(t.nombre || `dia-${i + 1}`);
    if (out.tiposDia[id]) errors.push(`${L}: id de tipo de día repetido "${id}"`);
    if (!Array.isArray(t.comidas) || !t.comidas.length) errors.push(`${L}: "${t.nombre || id}" no tiene comidas`);
    out.tiposDia[id] = {
      id,
      nombre: str(t.nombre) || id,
      kcal: num(t.kcal), proteina: num(t.proteina), carbohidratos: num(t.carbohidratos), grasas: num(t.grasas),
      aguaMl: num(t.aguaMl),
      notas: str(t.notas),
      comidas: (t.comidas || []).map((c, j) => ({
        nombre: str(c.nombre) || `Comida ${j + 1}`,
        hora: str(c.hora),
        notas: str(c.notas),
        kcal: num(c.kcal),
        alimentos: (c.alimentos || []).map((a) => normalizeAlimento(a, `"${c.nombre || j + 1}"`, errors)),
      })),
    };
  });
  const ids = Object.keys(out.tiposDia);
  let weeks = normalizeWeeks(d, makeResolver(out.tiposDia), L, errors);
  if (!weeks) {
    if (ids.length === 1) {
      weeks = [Object.fromEntries(WEEKDAYS.map((w) => [w, ids[0]]))];
    } else {
      errors.push(`${L}: falta "semana" (qué tipo de día toca cada día)`);
      weeks = [];
    }
  }
  weeks.forEach((w, i) => {
    const empty = WEEKDAYS.filter((day) => !w[day]);
    if (empty.length) warnings.push(`${L}: semana ${i + 1} sin dieta asignada para ${empty.join(', ')}`);
  });
  out.semanas = weeks;
  return out;
}

function normalizeHitos(list, errors) {
  if (!list) return [];
  if (!Array.isArray(list)) { errors.push('"hitos" debe ser una lista'); return []; }
  return list.map((h, i) => {
    if (!isValidISO(h.fecha)) errors.push(`Hito ${i + 1}: fecha inválida`);
    const tipo = HITO_TYPES.includes(h.tipo) ? h.tipo : 'otro';
    return { fecha: h.fecha, tipo, titulo: str(h.titulo) || tipoLabel(tipo), nota: str(h.nota) };
  });
}

function normalizeRecurrentes(list, errors) {
  if (!list) return null;
  if (!Array.isArray(list)) { errors.push('"hitosRecurrentes" debe ser una lista'); return null; }
  return list.map((h, i) => {
    const cada = Math.round(num(h.cadaDias) ?? 0);
    if (!(cada > 0)) errors.push(`Hito recurrente ${i + 1}: "cadaDias" debe ser > 0`);
    if (!isValidISO(h.desde)) errors.push(`Hito recurrente ${i + 1}: "desde" debe tener formato AAAA-MM-DD`);
    if (h.hasta && !isValidISO(h.hasta)) errors.push(`Hito recurrente ${i + 1}: "hasta" inválido`);
    const tipo = HITO_TYPES.includes(h.tipo) ? h.tipo : 'otro';
    return { tipo, titulo: str(h.titulo) || tipoLabel(tipo), cadaDias: cada || 7, desde: h.desde, hasta: h.hasta || null };
  });
}

export function tipoLabel(tipo) {
  return {
    inicio: 'Inicio', fin: 'Fin', fotos: 'Fotos de progreso', pesaje: 'Pesaje',
    perimetros: 'Perímetros', revision: 'Revisión con Claude', otro: 'Hito',
  }[tipo] || 'Hito';
}

/**
 * Valida y normaliza un archivo de plan de Claude.
 * Devuelve { ok, errors[], warnings[], rutina, dieta, hitos[], hitosRecurrentes|null, mensaje, original }
 */
export function validatePlan(obj) {
  const errors = [], warnings = [];
  if (typeof obj !== 'object' || obj === null) return { ok: false, errors: ['El archivo no contiene un objeto'], warnings };
  if (obj.tipo !== PLAN_TYPE) {
    if (obj.tipo === 'fitcoach-progreso') errors.push('Este archivo es un export de progreso, no un plan. Pide a Claude el plan en formato "fitcoach-plan".');
    else errors.push(`"tipo" debe ser "${PLAN_TYPE}"`);
  }
  if (obj.version != null && Number(obj.version) > PLAN_VERSION) {
    warnings.push(`El plan usa la versión ${obj.version}; esta app entiende la ${PLAN_VERSION}. Algunos campos podrían ignorarse.`);
  }
  const rutina = obj.rutina ? normalizeRutina(obj.rutina, errors, warnings) : null;
  const dieta = obj.dieta ? normalizeDieta(obj.dieta, errors, warnings) : null;
  const hitos = normalizeHitos(obj.hitos, errors);
  const hitosRecurrentes = normalizeRecurrentes(obj.hitosRecurrentes, errors);
  if (!rutina && !dieta && !hitos.length && !hitosRecurrentes) {
    errors.push('El plan no contiene "rutina", "dieta" ni "hitos"');
  }
  return {
    ok: errors.length === 0, errors, warnings,
    rutina, dieta, hitos, hitosRecurrentes,
    mensaje: str(obj.mensaje),
    original: obj,
  };
}

// ---------- Resolución por fecha ----------

/** plans: lista de registros {fechaInicio, fechaFin, data} de un mismo tipo. */
export function planOn(plans, date) {
  let best = null;
  for (const p of plans) {
    if (p.fechaInicio <= date && (!best || p.fechaInicio >= best.fechaInicio)) best = p;
  }
  if (best && best.fechaFin && date > best.fechaFin) return null;
  return best;
}

/** Semana del ciclo, alineada a lunes a partir de la semana de inicio. */
export function weekOfCycle(plan, date) {
  const n = plan.data.semanas.length || 1;
  const w = Math.floor(diffDays(startOfWeek(plan.fechaInicio), startOfWeek(date)) / 7);
  return ((w % n) + n) % n;
}

export function scheduledSession(rutinas, date) {
  const plan = planOn(rutinas, date);
  if (!plan || !plan.data.semanas.length) return null;
  const id = plan.data.semanas[weekOfCycle(plan, date)][weekdayKey(date)];
  if (!id) return null;
  return { plan, session: plan.data.sesiones[id] };
}

export function scheduledDiet(dietas, date) {
  const plan = planOn(dietas, date);
  if (!plan || !plan.data.semanas.length) return null;
  const id = plan.data.semanas[weekOfCycle(plan, date)][weekdayKey(date)];
  if (!id) return null;
  return { plan, tipo: plan.data.tiposDia[id] };
}

/** Expande hitos recurrentes en [from, to]. */
export function expandRecurring(recs, from, to) {
  const out = [];
  for (const r of recs || []) {
    const end = r.hasta && r.hasta < to ? r.hasta : to;
    let d = r.desde;
    if (d < from) d = addDays(d, Math.ceil(diffDays(d, from) / r.cadaDias) * r.cadaDias);
    while (d <= end) {
      out.push({ fecha: d, tipo: r.tipo, titulo: r.titulo, recurrente: true });
      d = addDays(d, r.cadaDias);
    }
  }
  return out;
}

/**
 * Estado de entrenamiento de un día programado.
 * logs: registros cuyo scheduledDate === date.
 * Devuelve: 'rest' | 'planned' | 'pending' | 'done' | 'partial' | 'recovered' | 'missed'
 */
export function computeStatus(hasSession, date, logs, todayISO) {
  if (!hasSession) return 'rest';
  const done = logs.filter((l) => l.status === 'done');
  const partial = logs.filter((l) => l.status === 'partial');
  if (done.length) return done.some((l) => l.date === date) ? 'done' : 'recovered';
  if (partial.length) return 'partial';
  if (logs.some((l) => l.status === 'missed')) return 'missed';
  if (date < todayISO) return 'missed';
  return date === todayISO ? 'pending' : 'planned';
}

export const STATUS_LABEL = {
  rest: 'Descanso', planned: 'Programado', pending: 'Pendiente', done: 'Hecho',
  partial: 'Parcial', recovered: 'Recuperado', missed: 'No realizado', none: 'Sin plan',
};
