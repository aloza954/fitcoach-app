// Lista de la compra semanal generada a partir de la dieta asignada a cada día.
import { dietOn, getShopState, setShopState } from '../store.js';
import { html, icon, toast, vibrate } from '../ui.js';
import { today, addDays, startOfWeek, fmtShort, range } from '../dates.js';
import { fmtQty, dietTabs } from './diet.js';

const CAT_ORDER = ['Frutas y verduras', 'Carnes y pescados', 'Huevos y lácteos', 'Panadería', 'Despensa', 'Congelados', 'Suplementos', 'Otros'];
let weekOffset = 0;
let fromToday = false;

/** Suma los alimentos de la dieta de las fechas dadas, agrupados por categoría. Exportada para tests. */
export function aggregate(dates, getDiet = dietOn) {
  const items = new Map();
  for (const d of dates) {
    const dd = getDiet(d);
    if (!dd) continue;
    for (const c of dd.tipo.comidas) {
      for (const a of c.alimentos) {
        const key = `${a.nombre.trim().toLowerCase()}|${(a.unidad || '').toLowerCase()}`;
        const it = items.get(key) || { key, nombre: a.nombre.trim(), unidad: a.unidad, categoria: a.categoria || 'Otros', cantidad: 0, veces: 0, sinCantidad: false };
        if (a.cantidad != null) it.cantidad += a.cantidad; else it.sinCantidad = true;
        it.veces++;
        items.set(key, it);
      }
    }
  }
  const groups = new Map();
  for (const it of items.values()) {
    if (!groups.has(it.categoria)) groups.set(it.categoria, []);
    groups.get(it.categoria).push(it);
  }
  const rank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? CAT_ORDER.length - 1 : i; };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([cat, list]) => [cat, list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))]);
}

const qtyText = (it) => (it.cantidad ? fmtQty(Math.round(it.cantidad * 10) / 10, it.unidad) : `${it.veces} ${it.veces === 1 ? 'vez' : 'veces'}`);

export default {
  async render(el, ctx) {
    const t = today();
    const ws = addDays(startOfWeek(t), weekOffset * 7);
    const we = addDays(ws, 6);
    const isCurrent = weekOffset === 0;
    const from = isCurrent && fromToday ? t : ws;
    const groups = aggregate(range(from, we));
    const state = await getShopState(ws);
    const total = groups.reduce((a, [, l]) => a + l.length, 0) + state.extra.length;
    const got = groups.reduce((a, [, l]) => a + l.filter((i) => state.checked[i.key]).length, 0) + state.extra.filter((x) => state.checked[`x:${x}`]).length;

    ctx.header('Lista de la compra', {
      sub: `${got}/${total} en el carro`,
      actions: html`<button class="icon-btn" data-share aria-label="Compartir lista">${icon('share', 20)}</button>`,
    });

    el.innerHTML = String(html`
      ${dietTabs('compra')}
      <div class="date-nav">
        <button class="icon-btn filled" data-w="-1" aria-label="Semana anterior">${icon('left')}</button>
        <div class="label">${weekOffset === 0 ? 'Esta semana' : weekOffset === 1 ? 'Próxima semana' : weekOffset === -1 ? 'Semana pasada' : `Semana del ${fmtShort(ws)}`}<small>${fmtShort(ws)} – ${fmtShort(we)}</small></div>
        <button class="icon-btn filled" data-w="1" aria-label="Semana siguiente">${icon('right')}</button>
      </div>
      ${isCurrent ? html`<div class="seg mb"><button data-from="0" class="${!fromToday ? 'on' : ''}">Semana completa</button><button data-from="1" class="${fromToday ? 'on' : ''}">Desde hoy</button></div>` : ''}
      ${!groups.length && !state.extra.length ? html`<div class="card empty">${icon('cart', 40)}<p class="strong">Nada que comprar</p><p class="small mt-s">No hay dieta asignada para estos días.</p></div>` : ''}
      ${groups.map(([cat, list]) => html`<div class="section-title">${cat}</div><div class="card" style="padding:4px 16px">
        ${list.map((it) => html`<div class="shop-item ${state.checked[it.key] ? 'got' : ''}" data-k="${it.key}" role="checkbox" aria-checked="${!!state.checked[it.key]}" tabindex="0">
          <span class="meal-check ${state.checked[it.key] ? 'on' : ''}" style="width:28px;height:28px">${icon('check', 15)}</span>
          <span class="grow">${it.nombre}</span><span class="muted strong small">${qtyText(it)}${it.sinCantidad && it.cantidad ? ' +' : ''}</span></div>`)}
      </div>`)}
      <div class="section-title">Otros productos</div>
      <div class="card" style="padding:4px 16px">
        ${state.extra.map((x) => html`<div class="shop-item ${state.checked[`x:${x}`] ? 'got' : ''}" data-k="x:${x}">
          <span class="meal-check ${state.checked[`x:${x}`] ? 'on' : ''}" style="width:28px;height:28px">${icon('check', 15)}</span>
          <span class="grow">${x}</span><button class="icon-btn" data-rm-extra="${x}" aria-label="Quitar">${icon('x', 18)}</button></div>`)}
        <form class="row gap" style="padding:10px 0" data-add><input type="text" name="item" placeholder="Añadir producto (p. ej. papel de cocina)" maxlength="60"><button class="btn small primary" type="submit" aria-label="Añadir">${icon('plus', 18)}</button></form>
      </div>
      ${got ? html`<button class="btn ghost block mt" data-reset>Desmarcar todo</button>` : ''}
      <p class="tiny muted mt">Cantidades sumadas en crudo para los días seleccionados. Agrupa los alimentos que coinciden en nombre y unidad.</p>
    `);

    const save = async () => { await setShopState(ws, state); ctx.refresh(); };
    el.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { weekOffset += Number(b.dataset.w); ctx.refresh(); }; });
    el.querySelectorAll('[data-from]').forEach((b) => { b.onclick = () => { fromToday = b.dataset.from === '1'; ctx.refresh(); }; });
    el.querySelectorAll('[data-k]').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('[data-rm-extra]')) return;
        const k = row.dataset.k;
        state.checked[k] = !state.checked[k];
        vibrate(10);
        save();
      };
    });
    el.querySelectorAll('[data-rm-extra]').forEach((b) => {
      b.onclick = () => { state.extra = state.extra.filter((x) => x !== b.dataset.rmExtra); delete state.checked[`x:${b.dataset.rmExtra}`]; save(); };
    });
    el.querySelector('[data-add]').onsubmit = (e) => {
      e.preventDefault();
      const v = e.target.item.value.trim();
      if (v && !state.extra.includes(v)) { state.extra.push(v); save(); }
    };
    const reset = el.querySelector('[data-reset]');
    if (reset) reset.onclick = () => { state.checked = {}; save(); };

    document.querySelector('#hdr [data-share]').onclick = async () => {
      const lines = [`Lista de la compra (${fmtShort(from)} – ${fmtShort(we)})`];
      for (const [cat, list] of groups) {
        const pending = list.filter((i) => !state.checked[i.key]);
        if (!pending.length) continue;
        lines.push('', cat.toUpperCase(), ...pending.map((i) => `☐ ${i.nombre}: ${qtyText(i)}`));
      }
      const extras = state.extra.filter((x) => !state.checked[`x:${x}`]);
      if (extras.length) lines.push('', 'OTROS', ...extras.map((x) => `☐ ${x}`));
      const text = lines.join('\n');
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('Lista copiada'); }
      } catch (e) {
        if (e.name !== 'AbortError') { await navigator.clipboard.writeText(text).catch(() => {}); toast('Lista copiada'); }
      }
    };
  },
};
