// Utilidades de fechas. Todas las fechas de la app son cadenas locales 'YYYY-MM-DD'.
// Se trabaja a mediodía local para evitar problemas con cambios de horario (DST).

export const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function isValidISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

export function today() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a, b) {
  // b - a en días
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

/** 0 = lunes ... 6 = domingo */
export function weekdayIndex(iso) {
  return (parseISO(iso).getDay() + 6) % 7;
}

export function weekdayKey(iso) {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function startOfWeek(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export function startOfMonth(iso) {
  return iso.slice(0, 8) + '01';
}

export function addMonths(iso, n) {
  const d = parseISO(startOfMonth(iso));
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

export function daysInMonth(iso) {
  const d = parseISO(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Normaliza nombres de día: "Miércoles" -> "miercoles" */
export function normalizeWeekday(name) {
  if (typeof name !== 'string') return null;
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return WEEKDAYS.includes(n) ? n : null;
}

export function fmtLong(iso) {
  const d = parseISO(iso);
  return `${WEEKDAY_LABELS[weekdayIndex(iso)]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function fmtDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtMonthYear(iso) {
  const d = parseISO(iso);
  const m = MONTHS[d.getMonth()];
  return `${m[0].toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}

/** "hoy", "ayer", "mañana", "hace 3 días", "en 5 días" */
export function relative(iso, ref = today()) {
  const n = diffDays(ref, iso);
  if (n === 0) return 'hoy';
  if (n === -1) return 'ayer';
  if (n === 1) return 'mañana';
  return n < 0 ? `hace ${-n} días` : `en ${n} días`;
}

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
