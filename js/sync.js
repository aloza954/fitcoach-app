// Export de progreso para Claude, import de planes y copias de seguridad completas.
import * as db from './db.js';
import { S, loadAll, sessionOn, dietOn, trainingStatus, trainingAdherence, streak, logsScheduledFor,
  extrasOn, dietAdherence, waterTotal, waterGoal, series, hitosBetween, rutinaOn, dietaOn, PERIMETROS, saveMeta } from './store.js';
import { today, addDays, range, diffDays, parseISO } from './dates.js';
import { extractJSON, validatePlan, weekOfCycle } from './plans.js';
import { SPEC_TEXT } from './claude-spec.js';
import { createZip, readZip } from './zip.js';

const APP = 'FitCoach';
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// ---------- Export de progreso ----------

function fmtSet(s) {
  const reps = s.reps ?? '?';
  return s.peso != null ? `${reps} x ${s.peso} kg` : `${reps} reps`;
}

function fmtObjetivo(o) {
  if (!o) return '';
  let t = `${o.series} x ${o.reps}`;
  if (o.peso != null) t += ` @ ${o.peso} kg`;
  if (o.rir) t += `, RIR ${o.rir}`;
  if (o.descansoSeg) t += `, desc ${o.descansoSeg} s`;
  return t;
}

function workoutEntry(w) {
  return {
    realizadoEl: w.date,
    sesion: w.sessionName,
    completadoPct: Math.round((w.completion || 0) * 100),
    duracionMin: w.duracionMin ?? null,
    esfuerzo: w.esfuerzo ?? null,
    notas: w.notas || undefined,
    ejercicios: w.exercises.map((e) => ({
      nombre: e.nombre,
      objetivo: fmtObjetivo(e.objetivo),
      series: e.sets.filter((s) => s.done).map(fmtSet),
      notas: e.notas || undefined,
    })),
  };
}

/** Pendiente semanal de peso (kg/semana) por regresión lineal sobre los últimos `days` días. */
function weeklyRate(points, ref, days = 28) {
  const pts = points.filter((p) => diffDays(p.date, ref) <= days);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => diffDays(pts[0].date, p.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, p) => a + p.value, 0) / pts.length;
  let num = 0, den = 0;
  pts.forEach((p, i) => { num += (xs[i] - mx) * (p.value - my); den += (xs[i] - mx) ** 2; });
  return den ? r1((num / den) * 7) : null;
}

function edad(nacimiento) {
  if (!nacimiento) return null;
  const n = parseISO(nacimiento), t = new Date();
  let e = t.getFullYear() - n.getFullYear();
  if (t.getMonth() < n.getMonth() || (t.getMonth() === n.getMonth() && t.getDate() < n.getDate())) e--;
  return e;
}

function planSummary(plan, date) {
  if (!plan) return null;
  return {
    nombre: plan.nombre, fechaInicio: plan.fechaInicio, fechaFin: plan.fechaFin || null,
    semanaDelCiclo: plan.data.semanas.length > 1 ? weekOfCycle(plan, date) + 1 : undefined,
    semanasDesdeInicio: Math.floor(diffDays(plan.fechaInicio, date) / 7) + 1,
    definicion: plan.original,
  };
}

/**
 * Construye el objeto de progreso para Claude.
 * opts: { desde, hasta, comentarios, photos: [registros de foto incluidos] }
 */
export function buildProgress({ desde, hasta = today(), comentarios = '', photos = [] }) {
  const ref = today();
  const dias = range(desde, hasta);

  const entrenamientos = [];
  for (const d of dias) {
    const s = sessionOn(d);
    const logs = logsScheduledFor(d);
    const st = trainingStatus(d, ref);
    if (s && !['planned'].includes(st)) {
      const real = logs.filter((l) => l.status !== 'missed');
      const missed = logs.find((l) => l.status === 'missed');
      entrenamientos.push({
        fecha: d, programado: s.session.nombre, estado: st,
        motivo: missed?.motivo || undefined,
        registros: real.map(workoutEntry),
      });
    }
    for (const x of extrasOn(d)) {
      entrenamientos.push({ fecha: d, programado: null, estado: 'extra', registros: [workoutEntry(x)] });
    }
  }

  const dieta = [];
  const agua = [];
  // Se distingue "no registrado" (el usuario no marcó nada ese día) de "no cumplido",
  // para que las medias no se hundan por días en los que simplemente no se usó la app.
  let dietSum = 0, dietLogged = 0, dietNoLog = 0, waterSum = 0, waterOk = 0, waterDays = 0, waterNoLog = 0;
  for (const d of dias.filter((x) => x <= ref)) {
    const dd = dietOn(d);
    const adh = dietAdherence(d);
    if (dd && adh) {
      const log = S.dietLogs.get(d);
      if (!adh.done && !log?.notas) {
        if (d < ref) { dieta.push({ fecha: d, tipoDia: dd.tipo.nombre, sinRegistro: true }); dietNoLog++; }
      } else {
        const hechas = dd.tipo.comidas.filter((_, i) => log?.done?.[i]).map((c) => c.nombre);
        const noHechas = dd.tipo.comidas.filter((_, i) => !log?.done?.[i]).map((c) => c.nombre);
        dieta.push({ fecha: d, tipoDia: dd.tipo.nombre, cumplimientoPct: Math.round(adh.pct * 100), hechas, noHechas, notas: log?.notas || undefined });
        dietSum += adh.pct;
        dietLogged++;
      }
    }
    const ml = waterTotal(d), goal = waterGoal(d);
    if (ml > 0) {
      agua.push({ fecha: d, ml, objetivoMl: goal });
      waterSum += ml; waterDays++;
      if (ml >= goal) waterOk++;
    } else if (d < ref) waterNoLog++;
  }

  const peso = series('peso');
  const pesoPeriodo = peso.filter((p) => p.date >= desde && p.date <= hasta);
  const last7 = peso.filter((p) => diffDays(p.date, ref) < 7);
  const perimetros = {};
  for (const [k] of PERIMETROS) {
    const s = series(k);
    if (s.length) perimetros[k] = { inicial: s[0].value, fechaInicial: s[0].date, actual: s[s.length - 1].value, fechaActual: s[s.length - 1].date, cambio: r1(s[s.length - 1].value - s[0].value) };
  }
  const grasa = series('grasa');
  const p = S.profile;

  return {
    tipo: 'fitcoach-progreso',
    version: 1,
    app: APP,
    generado: new Date().toISOString(),
    hoy: ref,
    leeme: 'Export de progreso de la app FitCoach. Lee "instruccionesParaClaude" para saber cómo analizarlo y en qué formato devolver un plan nuevo.',
    instruccionesParaClaude: SPEC_TEXT,
    periodo: { desde, hasta },
    comentariosDelUsuario: comentarios || undefined,
    perfil: {
      nombre: p.nombre || undefined, sexo: p.sexo || undefined, edad: edad(p.nacimiento), alturaCm: p.alturaCm ?? null,
      objetivo: p.objetivo || undefined, pesoObjetivo: p.pesoObjetivo ?? null, grasaObjetivo: p.grasaObjetivo ?? null,
      experiencia: p.experiencia || undefined, notas: p.notas || undefined,
    },
    planVigente: { rutina: planSummary(rutinaOn(ref), ref), dieta: planSummary(dietaOn(ref), ref) },
    planesFuturos: [...S.rutinas, ...S.dietas].filter((x) => x.fechaInicio > ref).map((x) => ({ tipo: x.kind, nombre: x.nombre, fechaInicio: x.fechaInicio })),
    resumen: {
      entrenamiento: { ...trainingAdherence(desde, hasta, ref), rachaActual: streak(ref) },
      dieta: { cumplimientoMedioPctDiasRegistrados: dietLogged ? Math.round((dietSum / dietLogged) * 100) : null, diasRegistrados: dietLogged, diasSinRegistro: dietNoLog },
      agua: { mediaMlDiasRegistrados: waterDays ? Math.round(waterSum / waterDays) : null, diasObjetivoCumplido: waterOk, diasRegistrados: waterDays, diasSinRegistro: waterNoLog },
      peso: peso.length ? {
        primerRegistro: peso[0], ultimo: peso[peso.length - 1],
        cambioTotalKg: r1(peso[peso.length - 1].value - peso[0].value),
        cambioPeriodoKg: pesoPeriodo.length > 1 ? r1(pesoPeriodo[pesoPeriodo.length - 1].value - pesoPeriodo[0].value) : null,
        mediaUltimos7Dias: last7.length ? r1(last7.reduce((a, b) => a + b.value, 0) / last7.length) : null,
        ritmoSemanalKg: weeklyRate(peso, ref),
      } : null,
      grasaCorporalPct: grasa.length ? { inicial: grasa[0], ultimo: grasa[grasa.length - 1] } : null,
      perimetrosCm: perimetros,
      fotos: { total: S.photos.length, ultimaFecha: S.photos.length ? S.photos[S.photos.length - 1].date : null, incluidasEnEsteExport: photos.length },
    },
    entrenamientos,
    dieta,
    agua,
    mediciones: S.measurements.map((m) => ({ fecha: m.date, pesoKg: m.peso ?? undefined, grasaPct: m.grasa ?? undefined, perimetrosCm: m.perimetros, notas: m.notas || undefined })),
    fotos: photos.map((f) => ({ fecha: f.date, pose: f.pose, archivo: photoName(f) })),
    hitosProximos: hitosBetween(ref, addDays(ref, 30)).map((h) => ({ fecha: h.fecha, tipo: h.tipo, titulo: h.titulo })),
    mensajesAnterioresDelEntrenador: S.mensajes.slice(0, 3),
  };
}

export const photoName = (f) => `fotos/${f.date}_${f.pose}_${f.id.slice(-4)}.jpg`;

/** Prepara los archivos de export. Devuelve { files: File[], zip: Blob|null, name } */
export async function makeExportFiles({ desde, hasta, comentarios, includePhotos }) {
  const photos = includePhotos ? S.photos.filter((f) => f.date >= desde && f.date <= hasta) : [];
  const data = buildProgress({ desde, hasta, comentarios, photos });
  const stamp = today();
  const jsonName = `fitcoach-progreso-${stamp}.json`;
  const json = JSON.stringify(data, null, 1);
  const files = [new File([json], jsonName, { type: 'application/json' })];
  let zip = null;
  if (photos.length) {
    for (const f of photos) files.push(new File([f.blob], photoName(f).replace('fotos/', ''), { type: 'image/jpeg' }));
    zip = await createZip([{ name: 'progreso.json', data: json }, ...photos.map((f) => ({ name: photoName(f), data: f.blob }))]);
  }
  return { files, zip, name: zip ? `fitcoach-progreso-${stamp}.zip` : jsonName, json };
}

export async function markExported() {
  await saveMeta({ lastExport: today() });
}

// ---------- Import de plan ----------

export async function readPlanFromFile(file) {
  if (/\.zip$/i.test(file.name)) {
    const entries = await readZip(file);
    const jsonEntry = [...entries.entries()].find(([n]) => /\.json$/i.test(n));
    if (!jsonEntry) throw new Error('El ZIP no contiene ningún archivo .json');
    return parsePlanText(new TextDecoder().decode(jsonEntry[1]));
  }
  return parsePlanText(await file.text());
}

export function parsePlanText(text) {
  return validatePlan(extractJSON(text));
}

// ---------- Compartir / descargar ----------

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Intenta abrir el menú "Compartir" de Android con los archivos. Devuelve true si se compartió. */
export async function shareFiles(files, title) {
  if (!navigator.canShare || !navigator.canShare({ files })) return false;
  try {
    await navigator.share({ files, title });
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return true; // el usuario cerró el menú
    return false;
  }
}

// ---------- Copia de seguridad completa ----------

export async function makeBackup() {
  const dump = {};
  for (const name of Object.keys(db.STORES)) {
    if (name === 'photos') continue;
    dump[name] = await db.all(name);
  }
  const photos = await db.all('photos');
  dump.photos = photos.map(({ blob, ...meta }) => meta);
  const files = [{ name: 'backup.json', data: JSON.stringify({ tipo: 'fitcoach-backup', version: 1, fecha: new Date().toISOString(), datos: dump }) }];
  for (const p of photos) files.push({ name: `fotos/${p.id}.jpg`, data: p.blob });
  return createZip(files);
}

export async function restoreBackup(file) {
  const entries = await readZip(file);
  const main = entries.get('backup.json');
  if (!main) throw new Error('No es una copia de seguridad de FitCoach (falta backup.json)');
  const backup = JSON.parse(new TextDecoder().decode(main));
  if (backup.tipo !== 'fitcoach-backup') throw new Error('El archivo no es una copia de seguridad de FitCoach');
  await db.wipeAll();
  for (const [name, rows] of Object.entries(backup.datos)) {
    if (!db.STORES[name]) continue;
    if (name === 'photos') {
      const withBlobs = rows.map((m) => {
        const bytes = entries.get(`fotos/${m.id}.jpg`);
        return bytes ? { ...m, blob: new Blob([bytes], { type: 'image/jpeg' }) } : null;
      }).filter(Boolean);
      await db.putMany('photos', withBlobs);
    } else {
      await db.putMany(name, rows);
    }
  }
  await loadAll();
}
