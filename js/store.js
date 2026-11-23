// Estado de la aplicación: carga todo en memoria al arrancar (los datos son pequeños;
// las fotos son Blobs referenciados), y expone consultas síncronas y mutaciones que persisten en IndexedDB.
import * as db from './db.js';
import { today, addDays, range, diffDays } from './dates.js';
import {
  planOn, scheduledSession, scheduledDiet, expandRecurring, computeStatus, tipoLabel,
} from './plans.js';

export const DEFAULT_SETTINGS = { aguaObjetivo: 2500, vasos: [250, 500, 750], tema: 'auto', sonido: true };
export const PERIMETROS = [
  ['cuello', 'Cuello'], ['hombros', 'Hombros'], ['pecho', 'Pecho'], ['cintura', 'Cintura'],
  ['abdomen', 'Abdomen (ombligo)'], ['cadera', 'Cadera'], ['brazo', 'Brazo'], ['muslo', 'Muslo'], ['gemelo', 'Gemelo'],
];
export const POSES = [['frente', 'Frente'], ['perfil', 'Perfil'], ['espalda', 'Espalda']];

export const S = {
  profile: {},
  settings: { ...DEFAULT_SETTINGS },
  meta: {},
  rutinas: [],
  dietas: [],
  workouts: [],
  dietLogs: new Map(),
  water: new Map(),
  measurements: [],
  photos: [],
  hitos: [],
  hitosRec: [],
  mensajes: [],
  draft: null,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export async function loadAll() {
  const [plans, workouts, dietLogs, water, measurements, photos] = await Promise.all([
    db.all('plans'), db.all('workouts'), db.all('dietLogs'), db.all('water'),
    db.all('measurements'), db.all('photos'),
  ]);
  S.profile = await db.kvGet('profile', {});
  S.settings = { ...DEFAULT_SETTINGS, ...(await db.kvGet('settings', {})) };
  S.meta = await db.kvGet('meta', {});
  S.hitos = await db.kvGet('hitos', []);
  S.hitosRec = await db.kvGet('hitosRec', []);
  S.mensajes = await db.kvGet('mensajes', []);
  S.draft = await db.kvGet('draft', null);
  S.rutinas = plans.filter((p) => p.kind === 'rutina').sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  S.dietas = plans.filter((p) => p.kind === 'dieta').sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  S.workouts = workouts.sort(byDate);
  S.dietLogs = new Map(dietLogs.map((d) => [d.date, d]));
  S.water = new Map(water.map((w) => [w.date, w]));
  S.measurements = measurements.sort(byDate);
  S.photos = photos.sort(byDate);
}

// ---------- Perfil, ajustes, meta ----------
export async function saveProfile(p) { S.profile = p; await db.kvSet('profile', p); emit(); }
export async function saveSettings(s) { S.settings = { ...S.settings, ...s }; await db.kvSet('settings', S.settings); emit(); }
export async function saveMeta(m) { S.meta = { ...S.meta, ...m }; await db.kvSet('meta', S.meta); }

// ---------- Planes ----------
export const rutinaOn = (date) => planOn(S.rutinas, date);
export const dietaOn = (date) => planOn(S.dietas, date);
export const sessionOn = (date) => scheduledSession(S.rutinas, date);
export const dietOn = (date) => scheduledDiet(S.dietas, date);

/** Rutina vigente o la próxima que empezará (para mostrar algo útil). */
export function currentOrNextRutina(date = today()) {
  return rutinaOn(date) || S.rutinas.find((p) => p.fechaInicio > date) || null;
}

async function addPlan(kind, data, original, mensaje) {
  const list = kind === 'rutina' ? S.rutinas : S.dietas;
  for (const old of list.filter((p) => p.fechaInicio === data.fechaInicio)) {
    await db.del('plans', old.id);
    list.splice(list.indexOf(old), 1);
  }
  const rec = {
    id: db.uid(), kind, nombre: data.nombre, fechaInicio: data.fechaInicio, fechaFin: data.fechaFin,
    data, original, mensaje, importedAt: new Date().toISOString(),
  };
  await db.put('plans', rec);
  list.push(rec);
  list.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  return rec;
}

/** Aplica un plan ya validado (ver plans.validatePlan). */
export async function applyPlan(parsed) {
  if (parsed.rutina) await addPlan('rutina', parsed.rutina, parsed.original.rutina, parsed.mensaje);
  if (parsed.dieta) await addPlan('dieta', parsed.dieta, parsed.original.dieta, parsed.mensaje);
  for (const h of parsed.hitos || []) {
    const dup = S.hitos.some((x) => x.fecha === h.fecha && x.tipo === h.tipo && x.titulo === h.titulo);
    if (!dup) S.hitos.push({ ...h, id: db.uid(), origen: 'claude' });
  }
  await db.kvSet('hitos', S.hitos);
  if (parsed.hitosRecurrentes) {
    S.hitosRec = parsed.hitosRecurrentes;
    await db.kvSet('hitosRec', S.hitosRec);
  }
  if (parsed.mensaje) {
    S.mensajes.unshift({ fecha: today(), texto: parsed.mensaje });
    S.mensajes = S.mensajes.slice(0, 20);
    await db.kvSet('mensajes', S.mensajes);
  }
  emit();
}

export async function deletePlan(id) {
  await db.del('plans', id);
  S.rutinas = S.rutinas.filter((p) => p.id !== id);
  S.dietas = S.dietas.filter((p) => p.id !== id);
  emit();
}

// ---------- Entrenamientos ----------
export const logsScheduledFor = (date) => S.workouts.filter((w) => w.scheduledDate === date);
export const logsPerformedOn = (date) => S.workouts.filter((w) => w.date === date && w.status !== 'missed');
export const extrasOn = (date) => S.workouts.filter((w) => w.date === date && !w.scheduledDate && w.status !== 'missed');

export function trainingStatus(date, ref = today()) {
  const s = sessionOn(date);
  if (!s) return rutinaOn(date) ? 'rest' : 'none';
  return computeStatus(true, date, logsScheduledFor(date), ref);
}

/** Sesiones no realizadas en los últimos `days` días (candidatas a recuperar). */
export function pendingRecoveries(days = 7, ref = today()) {
  const out = [];
  for (let d = addDays(ref, -days); d < ref; d = addDays(d, 1)) {
    if (trainingStatus(d, ref) === 'missed') out.push({ date: d, ...sessionOn(d) });
  }
  return out;
}

export function trainingAdherence(from, to, ref = today()) {
  const r = { programados: 0, hechos: 0, parciales: 0, recuperados: 0, noRealizados: 0, extra: 0, pct: null };
  let score = 0;
  for (const d of range(from, to > ref ? ref : to)) {
    const st = trainingStatus(d, ref);
    if (['rest', 'none'].includes(st)) continue;
    if (st === 'pending') continue; // hoy, aún no cuenta
    r.programados++;
    if (st === 'done') { r.hechos++; score += 1; }
    else if (st === 'recovered') { r.recuperados++; score += 1; }
    else if (st === 'partial') {
      r.parciales++;
      score += Math.max(...logsScheduledFor(d).map((l) => l.completion || 0));
    } else if (st === 'missed') r.noRealizados++;
  }
  r.extra = S.workouts.filter((w) => !w.scheduledDate && w.status !== 'missed' && w.date >= from && w.date <= to).length;
  r.pct = r.programados ? Math.round((score / r.programados) * 100) : null;
  return r;
}

/** Sesiones programadas consecutivas completadas (hacia atrás desde hoy). */
export function streak(ref = today()) {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(ref, -i);
    if (S.rutinas.length && d < S.rutinas[0].fechaInicio) break;
    const st = trainingStatus(d, ref);
    if (st === 'done' || st === 'recovered') n++;
    else if (st === 'missed' || st === 'partial') break;
  }
  return n;
}

export function workoutCompletion(w) {
  let target = 0, done = 0;
  for (const e of w.exercises) {
    const t = e.objetivo?.series || e.sets.length;
    target += t;
    done += Math.min(t, e.sets.filter((s) => s.done).length);
  }
  return target ? done / target : 0;
}

/** Último registro de un ejercicio (por nombre) anterior a `beforeDate`. */
export function lastPerformance(nombre, beforeDate, excludeId) {
  const key = nombre.trim().toLowerCase();
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const w = S.workouts[i];
    if (w.id === excludeId || w.status === 'missed' || w.date > beforeDate) continue;
    const e = w.exercises?.find((x) => x.nombre.trim().toLowerCase() === key);
    if (e && e.sets.some((s) => s.done)) return { date: w.date, sets: e.sets.filter((s) => s.done) };
  }
  return null;
}

function maxWeight(nombre, excludeId) {
  const key = nombre.trim().toLowerCase();
  let max = null;
  for (const w of S.workouts) {
    if (w.id === excludeId || w.status === 'missed') continue;
    const e = w.exercises?.find((x) => x.nombre.trim().toLowerCase() === key);
    for (const s of e?.sets || []) if (s.done && s.peso != null && (max == null || s.peso > max)) max = s.peso;
  }
  return max;
}

/** Guarda un entrenamiento. Devuelve la lista de récords personales batidos. */
export async function saveWorkout(w) {
  w.completion = workoutCompletion(w);
  w.status = w.completion >= 0.999 ? 'done' : 'partial';
  w.updatedAt = new Date().toISOString();
  w.createdAt = w.createdAt || w.updatedAt;
  const prs = [];
  for (const e of w.exercises) {
    const prev = maxWeight(e.nombre, w.id);
    const best = Math.max(...e.sets.filter((s) => s.done && s.peso != null).map((s) => s.peso), -Infinity);
    if (prev != null && best > prev) prs.push({ nombre: e.nombre, peso: best, anterior: prev });
  }
  await db.put('workouts', w);
  S.workouts = S.workouts.filter((x) => x.id !== w.id);
  S.workouts.push(w);
  S.workouts.sort(byDate);
  emit();
  return prs;
}

export async function markMissed(date, session, motivo) {
  const w = {
    id: db.uid(), date, scheduledDate: date, status: 'missed', motivo: motivo || '',
    planId: session?.plan?.id, sessionId: session?.session?.id, sessionName: session?.session?.nombre || '',
    exercises: [], createdAt: new Date().toISOString(),
  };
  await db.put('workouts', w);
  S.workouts.push(w);
  S.workouts.sort(byDate);
  emit();
}

export async function deleteWorkout(id) {
  await db.del('workouts', id);
  S.workouts = S.workouts.filter((w) => w.id !== id);
  emit();
}

/** Crea un borrador de entrenamiento a partir de la sesión del plan. */
export function newWorkoutFrom(sessionInfo, { scheduledDate = null, date = today() } = {}) {
  const { plan, session } = sessionInfo;
  return {
    id: db.uid(),
    date,
    scheduledDate,
    planId: plan.id,
    sessionId: session.id,
    sessionName: session.nombre,
    startedAt: new Date().toISOString(),
    notas: '',
    esfuerzo: null,
    duracionMin: null,
    exercises: session.ejercicios.map((e) => {
      const last = lastPerformance(e.nombre, date);
      return {
        nombre: e.nombre,
        objetivo: { series: e.series, reps: e.reps, descansoSeg: e.descansoSeg, peso: e.peso, rir: e.rir, tempo: e.tempo, notas: e.notas },
        sets: Array.from({ length: e.series }, (_, i) => ({
          reps: null,
          peso: last?.sets[i]?.peso ?? last?.sets[last.sets.length - 1]?.peso ?? e.peso ?? null,
          done: false,
        })),
        notas: '',
      };
    }),
  };
}

export async function saveDraft(d) { S.draft = d; await db.kvSet('draft', d); }
export async function clearDraft() { S.draft = null; await db.kvDel('draft'); }

// ---------- Dieta ----------
export function dietLog(date) {
  return S.dietLogs.get(date) || { date, done: {}, notas: '' };
}

export async function toggleMeal(date, idx) {
  const log = { ...dietLog(date) };
  log.done = { ...log.done, [idx]: !log.done[idx] };
  S.dietLogs.set(date, log);
  await db.put('dietLogs', log);
  emit();
}

export async function setDietNote(date, notas) {
  const log = { ...dietLog(date), notas };
  S.dietLogs.set(date, log);
  await db.put('dietLogs', log);
}

/** { done, total, pct } o null si no hay dieta ese día. */
export function dietAdherence(date) {
  const d = dietOn(date);
  if (!d) return null;
  const total = d.tipo.comidas.length;
  const log = dietLog(date);
  const done = d.tipo.comidas.filter((_, i) => log.done[i]).length;
  return { done, total, pct: total ? done / total : 0 };
}

// ---------- Lista de la compra (estado por semana: marcados y productos añadidos a mano) ----------
export async function getShopState(weekStart) {
  return db.kvGet(`shop:${weekStart}`, { checked: {}, extra: [] });
}
export async function setShopState(weekStart, state) {
  return db.kvSet(`shop:${weekStart}`, state);
}

// ---------- Agua ----------
export const waterEntries = (date) => S.water.get(date)?.entries || [];
export const waterTotal = (date) => waterEntries(date).reduce((s, e) => s + e.ml, 0);

export function waterGoal(date) {
  const d = dietOn(date);
  return d?.tipo.aguaMl || d?.plan.data.objetivos.aguaMl || S.settings.aguaObjetivo || 2500;
}

export async function addWater(date, ml) {
  const rec = { date, entries: [...waterEntries(date), { t: new Date().toISOString(), ml }] };
  S.water.set(date, rec);
  await db.put('water', rec);
  emit();
}

export async function removeWater(date, index) {
  const entries = waterEntries(date).filter((_, i) => i !== index);
  const rec = { date, entries };
  S.water.set(date, rec);
  await db.put('water', rec);
  emit();
}

// ---------- Medidas y fotos ----------
export const measurementOn = (date) => S.measurements.find((m) => m.date === date) || null;

export async function saveMeasurement(m) {
  const rec = { ...m, id: m.date };
  await db.put('measurements', rec);
  S.measurements = S.measurements.filter((x) => x.date !== m.date);
  S.measurements.push(rec);
  S.measurements.sort(byDate);
  emit();
}

export async function deleteMeasurement(date) {
  await db.del('measurements', date);
  S.measurements = S.measurements.filter((m) => m.date !== date);
  emit();
}

/** Serie [{date, value}] de un campo: 'peso', 'grasa' o un perímetro. */
export function series(field) {
  return S.measurements
    .map((m) => ({ date: m.date, value: field === 'peso' || field === 'grasa' ? m[field] : m.perimetros?.[field] }))
    .filter((p) => p.value != null);
}

export async function savePhoto(p) {
  const rec = { id: db.uid(), createdAt: new Date().toISOString(), ...p };
  await db.put('photos', rec);
  S.photos.push(rec);
  S.photos.sort(byDate);
  emit();
  return rec;
}

export async function deletePhoto(id) {
  await db.del('photos', id);
  S.photos = S.photos.filter((p) => p.id !== id);
  emit();
}

// ---------- Hitos ----------
function hitoDone(h) {
  const near = (d) => Math.abs(diffDays(h.fecha, d)) <= 1;
  if (h.tipo === 'pesaje') return S.measurements.some((m) => near(m.date) && m.peso != null);
  if (h.tipo === 'perimetros') return S.measurements.some((m) => near(m.date) && m.perimetros && Object.values(m.perimetros).some((v) => v != null));
  if (h.tipo === 'fotos') return S.photos.some((p) => near(p.date));
  return false;
}

/** Hitos (puntuales, recurrentes y automáticos de inicio/fin de plan) entre dos fechas. */
export function hitosBetween(from, to) {
  const list = [
    ...S.hitos.filter((h) => h.fecha >= from && h.fecha <= to),
    ...expandRecurring(S.hitosRec, from, to),
  ];
  for (const p of S.rutinas) {
    if (p.fechaInicio >= from && p.fechaInicio <= to) list.push({ fecha: p.fechaInicio, tipo: 'inicio', titulo: `Inicio rutina: ${p.nombre}`, auto: true });
    // El fin solo se marca si la rutina sigue vigente ese día (no si otra la sustituyó antes)
    if (p.fechaFin && p.fechaFin >= from && p.fechaFin <= to && rutinaOn(p.fechaFin)?.id === p.id) {
      list.push({ fecha: p.fechaFin, tipo: 'fin', titulo: `Fin rutina: ${p.nombre}`, auto: true });
    }
  }
  for (const p of S.dietas) {
    if (p.fechaInicio >= from && p.fechaInicio <= to) list.push({ fecha: p.fechaInicio, tipo: 'inicio', titulo: `Inicio dieta: ${p.nombre}`, auto: true });
  }
  return list.map((h) => ({ ...h, hecho: hitoDone(h) })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function addHito(h) {
  S.hitos.push({ id: db.uid(), origen: 'usuario', titulo: h.titulo || tipoLabel(h.tipo), ...h });
  await db.kvSet('hitos', S.hitos);
  emit();
}

export async function deleteHito(id) {
  S.hitos = S.hitos.filter((h) => h.id !== id);
  await db.kvSet('hitos', S.hitos);
  emit();
}
