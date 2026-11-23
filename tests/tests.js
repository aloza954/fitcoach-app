// Tests de la lógica pura (fechas, planes, estados, hitos, ZIP, lista de la compra).
// Se ejecutan en el navegador: abre http://localhost:8765/tests/ con el servidor de desarrollo.
// No tocan la base de datos de la app.
import * as D from '../js/dates.js';
import * as P from '../js/plans.js';
import { createZip, readZip, crc32 } from '../js/zip.js';
import { examplePlan } from '../js/claude-spec.js';
import { aggregate } from '../js/views/shopping.js';
import { esc, html } from '../js/ui.js';

const results = [];
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => results.push({ name, ok: true }))
    .catch((e) => results.push({ name, ok: false, err: e.message }));
}
function eq(a, b, msg = '') {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} esperado ${sb}, obtenido ${sa}`);
}
function ok(v, msg = 'esperado verdadero') { if (!v) throw new Error(msg); }

const asPlan = (data, kind = 'rutina') => ({ id: Math.random().toString(36), kind, fechaInicio: data.fechaInicio, fechaFin: data.fechaFin, data });

await test('fechas: addDays cruza meses y cambio de hora', () => {
  eq(D.addDays('2026-10-24', 2), '2026-10-26');
  eq(D.addDays('2026-03-28', 2), '2026-03-30');
  eq(D.addDays('2026-12-31', 1), '2027-01-01');
});
await test('fechas: semana empieza en lunes', () => {
  eq(D.weekdayKey('2026-11-23'), 'lunes');
  eq(D.startOfWeek('2026-11-29'), '2026-11-23');
  eq(D.weekdayKey('2026-11-29'), 'domingo');
});
await test('fechas: validación ISO', () => {
  ok(D.isValidISO('2026-02-28'));
  ok(!D.isValidISO('2026-02-30'));
  ok(!D.isValidISO('2026-13-01'));
  ok(!D.isValidISO('26-1-1'));
});
await test('fechas: normaliza días con tilde', () => {
  eq(D.normalizeWeekday('Miércoles'), 'miercoles');
  eq(D.normalizeWeekday('SÁBADO'), 'sabado');
  eq(D.normalizeWeekday('funday'), null);
});

await test('extractJSON: admite texto y bloque ```json', () => {
  eq(P.extractJSON('Aquí va:\n```json\n{"a":1}\n```\nSaludos').a, 1);
  eq(P.extractJSON('{"b":2}').b, 2);
});
await test('extractJSON: error claro si no hay JSON', () => {
  let msg = '';
  try { P.extractJSON('hola'); } catch (e) { msg = e.message; }
  ok(msg.includes('JSON'), msg);
});

await test('plan de ejemplo es válido', () => {
  const r = P.validatePlan(examplePlan('2026-11-23'));
  eq(r.errors, []);
  ok(r.ok);
  eq(Object.keys(r.rutina.sesiones).length, 4);
  eq(r.dieta.semanas[0].miercoles, 'descanso', 'tipo de dieta llamado "descanso"');
});
await test('validación: detecta errores típicos', () => {
  const r = P.validatePlan({ tipo: 'fitcoach-plan', rutina: { fechaInicio: '2026-02-30', sesiones: [{ id: 'a', ejercicios: [{ nombre: 'X', series: 0 }] }], semana: { lunes: 'zz', funday: 'a' } } });
  ok(!r.ok);
  eq(r.errors.length, 4, r.errors.join(' | '));
});
await test('validación: rechaza un export de progreso', () => {
  const r = P.validatePlan({ tipo: 'fitcoach-progreso' });
  ok(r.errors[0].includes('export de progreso'));
});
await test('validación: sesiones referidas por nombre y "descanso" en rutina', () => {
  const r = P.validatePlan({ tipo: 'fitcoach-plan', rutina: { fechaInicio: '2026-11-30', sesiones: [{ id: 'tA', nombre: 'Torso A', ejercicios: [{ nombre: 'Press', series: 3 }] }], semana: { Lunes: 'Torso A', martes: 'descanso', jueves: 'ta' } } });
  eq(r.errors, []);
  eq(r.rutina.semanas[0].lunes, 'tA');
  eq(r.rutina.semanas[0].martes, null);
  eq(r.rutina.semanas[0].jueves, 'tA');
});
await test('validación: dieta con un solo tipo de día no necesita "semana"', () => {
  const r = P.validatePlan({ tipo: 'fitcoach-plan', dieta: { fechaInicio: '2026-11-30', tiposDia: [{ id: 'u', comidas: [{ nombre: 'D', alimentos: ['Café'] }] }] } });
  eq(r.errors, []);
  eq(r.dieta.semanas[0].domingo, 'u');
});

await test('planOn: el plan más reciente sustituye al anterior y respeta fechaFin', () => {
  const a = asPlan({ fechaInicio: '2026-11-02', fechaFin: '2026-12-27', semanas: [] });
  const b = asPlan({ fechaInicio: '2026-11-30', fechaFin: '2026-12-06', semanas: [] });
  eq(P.planOn([a, b], '2026-11-29')?.id, a.id);
  eq(P.planOn([a, b], '2026-11-30')?.id, b.id);
  eq(P.planOn([a, b], '2026-12-07'), null, 'tras fechaFin del plan vigente');
  eq(P.planOn([a, b], '2026-11-01'), null, 'antes de empezar');
});
await test('ciclo de semanas: alterna a partir del lunes de inicio', () => {
  const r = P.validatePlan({ tipo: 'fitcoach-plan', rutina: { fechaInicio: '2026-12-02', sesiones: [{ id: 'a', ejercicios: [{ nombre: 'X', series: 1 }] }, { id: 'b', ejercicios: [{ nombre: 'Y', series: 1 }] }], semanas: [{ lunes: 'a', miercoles: 'a' }, { lunes: 'b', miercoles: 'b' }] } });
  const plan = asPlan(r.rutina);
  eq(P.scheduledSession([plan], '2026-12-02')?.session.id, 'a');
  eq(P.scheduledSession([plan], '2026-12-07')?.session.id, 'b');
  eq(P.scheduledSession([plan], '2026-12-14')?.session.id, 'a');
  eq(P.scheduledSession([plan], '2026-12-08'), null, 'martes = descanso');
});

await test('estado: hecho, recuperado, parcial, no realizado, pendiente', () => {
  const T = '2026-11-23';
  eq(P.computeStatus(false, '2026-11-20', [], T), 'rest');
  eq(P.computeStatus(true, '2026-11-20', [{ status: 'done', date: '2026-11-20' }], T), 'done');
  eq(P.computeStatus(true, '2026-11-20', [{ status: 'done', date: '2026-11-22' }], T), 'recovered');
  eq(P.computeStatus(true, '2026-11-20', [{ status: 'partial', date: '2026-11-20' }], T), 'partial');
  eq(P.computeStatus(true, '2026-11-20', [{ status: 'missed', date: '2026-11-20' }, { status: 'done', date: '2026-11-21' }], T), 'recovered', 'recuperar tras marcar no realizado');
  eq(P.computeStatus(true, '2026-11-20', [], T), 'missed');
  eq(P.computeStatus(true, T, [], T), 'pending');
  eq(P.computeStatus(true, '2026-11-25', [], T), 'planned');
});

await test('hitos recurrentes: expansión dentro del rango', () => {
  const recs = [{ tipo: 'pesaje', titulo: 'Pesaje', cadaDias: 7, desde: '2026-11-02' }];
  eq(P.expandRecurring(recs, '2026-11-20', '2026-12-01').map((h) => h.fecha), ['2026-11-23', '2026-11-30']);
  eq(P.expandRecurring([{ ...recs[0], hasta: '2026-11-10' }], '2026-11-01', '2026-11-30').map((h) => h.fecha), ['2026-11-02', '2026-11-09']);
});

await test('ZIP: CRC32 conocido', () => {
  eq(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
});
await test('ZIP: ida y vuelta con UTF-8 y binario', async () => {
  const blob = await createZip([{ name: 'progreso.json', data: '{"día":"✓"}' }, { name: 'fotos/a.jpg', data: new Uint8Array([1, 2, 3]) }]);
  const m = await readZip(blob);
  eq(new TextDecoder().decode(m.get('progreso.json')), '{"día":"✓"}');
  eq([...m.get('fotos/a.jpg')], [1, 2, 3]);
});

await test('lista de la compra: suma por nombre+unidad y agrupa por categoría', () => {
  const r = P.validatePlan(examplePlan('2026-11-23'));
  const plan = asPlan(r.dieta, 'dieta');
  const groups = aggregate(D.range('2026-11-23', '2026-11-29'), (d) => P.scheduledDiet([plan], d));
  const all = Object.fromEntries(groups.flatMap(([, l]) => l.map((i) => [i.nombre, i.cantidad])));
  eq(all['Aceite de oliva virgen extra'], 125, 'AOVE 4x20 + 3x15');
  eq(all.Huevos, 9);
  eq(all['Pechuga de pollo'], 720);
  eq(groups[0][0], 'Frutas y verduras', 'orden de categorías');
});

await test('seguridad: el HTML importado se escapa', () => {
  eq(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  eq(String(html`<b>${'<script>'}</b>`), '<b>&lt;script&gt;</b>');
});

// ---------- Informe ----------
const passed = results.filter((r) => r.ok).length;
document.getElementById('out').innerHTML = `<h1>${passed}/${results.length} tests OK</h1><ul>${results.map((r) => `<li class="${r.ok ? 'ok' : 'ko'}">${r.ok ? '✔' : '✘'} ${esc(r.name)}${r.err ? `<br><small>${esc(r.err)}</small>` : ''}</li>`).join('')}</ul>`;
document.title = `${passed}/${results.length} tests`;
window.__results = results;
