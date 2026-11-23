// Calendario mensual: estado de cada entreno (verde/ámbar/rojo) e hitos.
import { sessionOn, trainingStatus, hitosBetween, extrasOn, trainingAdherence } from '../store.js';
import { html, icon } from '../ui.js';
import {
  today, startOfMonth, addMonths, addDays, daysInMonth, weekdayIndex, WEEKDAY_SHORT, fmtMonthYear, parseISO,
} from '../dates.js';
import { openDaySheet, hitoRow, HITO_ICON, openHitoSheet } from '../widgets.js';

let month = null; // se conserva entre visitas a la pantalla

export default {
  render(el, ctx) {
    const t = today();
    if (ctx.params.mes) month = startOfMonth(ctx.params.mes);
    if (!month) month = startOfMonth(t);
    const first = month;
    const n = daysInMonth(first);
    const last = addDays(first, n - 1);
    const lead = weekdayIndex(first);
    const gridStart = addDays(first, -lead);
    const cells = Math.ceil((lead + n) / 7) * 7;
    const hitos = hitosBetween(gridStart, addDays(gridStart, cells - 1));
    const byDay = {};
    hitos.forEach((h) => { (byDay[h.fecha] = byDay[h.fecha] || []).push(h); });
    const adh = trainingAdherence(first, last, t);

    ctx.header('Calendario', {
      sub: adh.pct != null ? `Cumplimiento del mes: ${adh.pct}%` : '',
      actions: html`<button class="icon-btn" data-add-hito aria-label="Añadir hito">${icon('plus')}</button>`,
    });

    const dayCell = (d) => {
      const st = trainingStatus(d, t);
      const s = sessionOn(d);
      const hs = byDay[d] || [];
      const extra = extrasOn(d).length;
      const cls = ['cal-day', `st-${st}`, d.slice(0, 7) !== first.slice(0, 7) ? 'out' : '', d === t ? 'today' : ''].join(' ');
      return html`<button class="${cls}" data-day="${d}" aria-label="${d}">
        ${st === 'recovered' ? html`<span class="rec">${icon('redo', 11)}</span>` : ''}
        <span>${parseISO(d).getDate()}</span>
        ${s ? html`<span class="tag">${s.session.nombre}</span>` : extra ? html`<span class="tag">Extra</span>` : ''}
        <span class="marks">${hs.slice(0, 3).map((h) => icon(HITO_ICON[h.tipo] || 'info', 12))}</span>
      </button>`;
    };

    const monthHitos = hitos.filter((h) => h.fecha >= first && h.fecha <= last);
    el.innerHTML = String(html`
      <div class="card">
        <div class="row between mb">
          <button class="icon-btn filled" data-nav="-1" aria-label="Mes anterior">${icon('left')}</button>
          <div class="col center"><strong>${fmtMonthYear(first)}</strong>
            ${first !== startOfMonth(t) ? html`<button class="btn small ghost mt-s" data-nav="0" style="min-height:28px">Hoy</button>` : ''}</div>
          <button class="icon-btn filled" data-nav="1" aria-label="Mes siguiente">${icon('right')}</button>
        </div>
        <div class="cal-head">${WEEKDAY_SHORT.map((d) => html`<span>${d}</span>`)}</div>
        <div class="cal-grid" data-grid>${Array.from({ length: cells }, (_, i) => dayCell(addDays(gridStart, i)))}</div>
        <div class="legend mt">
          <span><i style="background:var(--ok)"></i>Hecho</span>
          <span><i style="background:var(--warn)"></i>Parcial</span>
          <span><i style="background:var(--bad)"></i>No realizado</span>
          <span><i style="background:var(--accent-soft)"></i>Programado</span>
          <span>${icon('redo', 12)} Recuperado</span>
        </div>
        <div class="legend mt-s">
          <span>${icon('camera', 12)} Fotos</span><span>${icon('scale', 12)} Pesaje</span>
          <span>${icon('ruler', 12)} Perímetros</span><span>${icon('flag', 12)} Inicio/fin</span><span>${icon('sparkles', 12)} Revisión</span>
        </div>
      </div>
      ${adh.programados ? html`<div class="card"><div class="grid3">
        <div class="stat"><span class="v ok-text">${adh.hechos + adh.recuperados}</span><span class="l">Hechos</span></div>
        <div class="stat"><span class="v warn-text">${adh.parciales}</span><span class="l">Parciales</span></div>
        <div class="stat"><span class="v bad-text">${adh.noRealizados}</span><span class="l">No realizados</span></div>
      </div></div>` : ''}
      <div class="section-title">Hitos del mes</div>
      <div class="card">${monthHitos.length ? monthHitos.map((h) => hitoRow(h, { showDate: true })) : html`<p class="small muted">No hay hitos este mes.</p>`}</div>
    `);

    el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => openDaySheet(b.dataset.day, ctx); });
    el.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => {
        const k = Number(b.dataset.nav);
        month = k === 0 ? startOfMonth(t) : addMonths(month, k);
        ctx.refresh();
      };
    });
    document.querySelector('#hdr [data-add-hito]').onclick = () => openHitoSheet(t, ctx.refresh);

    // Deslizar a izquierda/derecha para cambiar de mes
    const grid = el.querySelector('[data-grid]');
    let x0 = null, y0 = null;
    grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        month = addMonths(month, dx < 0 ? 1 : -1);
        ctx.refresh();
      }
    }, { passive: true });
  },
};
