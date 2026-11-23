// Gráficas SVG ligeras (línea con puntos, media móvil, objetivo y sparkline).
import { diffDays, fmtShort } from './dates.js';
import { esc, fmtNum, raw } from './ui.js';

/**
 * points: [{ date: 'YYYY-MM-DD', value: number }] ordenados por fecha.
 * opts: { unit, target, trend: [{date,value}], height, color }
 */
export function lineChart(points, opts = {}) {
  const W = 340, H = opts.height || 170, padL = 34, padR = 12, padT = 14, padB = 24;
  if (!points.length) {
    return raw(`<div class="chart-empty">Sin datos todavía</div>`);
  }
  const color = opts.color || 'var(--accent)';
  const all = [...points.map((p) => p.value), ...(opts.trend || []).map((p) => p.value)];
  if (opts.target != null) all.push(opts.target);
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08; max += span * 0.08;

  const d0 = points[0].date, d1 = points[points.length - 1].date;
  const days = Math.max(1, diffDays(d0, d1));
  const x = (d) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (diffDays(d0, d) / days) * (W - padL - padR));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="grid"/>`
      + `<text x="${padL - 6}" y="${yy}" class="axis" text-anchor="end" dominant-baseline="middle">${fmtNum(v, span < 5 ? 1 : 0)}</text>`;
  }
  const xLabels = points.length > 1
    ? `<text x="${padL}" y="${H - 6}" class="axis">${esc(fmtShort(d0))}</text>
       <text x="${W - padR}" y="${H - 6}" class="axis" text-anchor="end">${esc(fmtShort(d1))}</text>`
    : `<text x="${W / 2}" y="${H - 6}" class="axis" text-anchor="middle">${esc(fmtShort(d0))}</text>`;

  const target = opts.target != null
    ? `<line x1="${padL}" x2="${W - padR}" y1="${y(opts.target)}" y2="${y(opts.target)}" class="target"/>
       <text x="${W - padR}" y="${y(opts.target) - 5}" class="axis" text-anchor="end">Objetivo ${fmtNum(opts.target)}</text>`
    : '';
  const trend = opts.trend && opts.trend.length > 1
    ? `<path d="${path(opts.trend)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`
    : '';
  const area = points.length > 1
    ? `<path d="${path(points)} L${x(d1)},${H - padB} L${x(d0)},${H - padB} Z" fill="${color}" opacity=".08"/>`
    : '';
  const line = `<path d="${path(points)}" fill="none" stroke="${color}" stroke-width="${opts.trend ? 1.2 : 2.5}" stroke-opacity="${opts.trend ? 0.5 : 1}" stroke-linejoin="round"/>`;
  const dots = points.length <= 40
    ? points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="3" fill="${color}"><title>${esc(fmtShort(p.date))}: ${fmtNum(p.value)}${esc(opts.unit || '')}</title></circle>`).join('')
    : '';

  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.label || 'Gráfica')}">
    ${grid}${target}${area}${line}${trend}${dots}${xLabels}</svg>`);
}

export function sparkline(values, { color = 'var(--accent)', w = 90, h = 30 } = {}) {
  if (values.length < 2) return raw('');
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return raw(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}

/** Media móvil por ventana de días (no por número de puntos). */
export function movingAverage(points, windowDays = 7) {
  return points.map((p) => {
    const win = points.filter((q) => q.date <= p.date && diffDays(q.date, p.date) < windowDays);
    return { date: p.date, value: win.reduce((s, q) => s + q.value, 0) / win.length };
  });
}
