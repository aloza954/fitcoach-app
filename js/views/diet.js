// Dieta del día (por defecto hoy, navegable a días pasados y futuros) con agua y comidas marcables.
import { dietOn, dietLog, toggleMeal, setDietNote, dietAdherence } from '../store.js';
import { html, icon, bar, fmtNum, vibrate } from '../ui.js';
import { today, addDays, fmtLong, relative, isValidISO } from '../dates.js';
import { waterCard, bindWater } from '../widgets.js';

/** Formatea cantidades: 1500 g -> "1,5 kg", 2 ud -> "2 ud". Compartido con la lista de la compra. */
export function fmtQty(cantidad, unidad) {
  if (cantidad == null) return unidad || '';
  const u = (unidad || '').toLowerCase();
  if (u === 'g' && cantidad >= 1000) return `${fmtNum(cantidad / 1000, 2)} kg`;
  if (u === 'ml' && cantidad >= 1000) return `${fmtNum(cantidad / 1000, 2)} L`;
  return `${fmtNum(cantidad, 1)} ${unidad || ''}`.trim();
}

export function dietTabs(active) {
  return html`<nav class="seg mb">
    <a href="#/dieta" class="${active === 'menu' ? 'on' : ''}">Menú del día</a>
    <a href="#/compra" class="${active === 'compra' ? 'on' : ''}">Lista de la compra</a>
  </nav>`;
}

export default {
  render(el, ctx) {
    const t = today();
    const date = isValidISO(ctx.params.fecha) ? ctx.params.fecha : t;
    const d = dietOn(date);
    ctx.header('Dieta', { sub: d ? d.plan.nombre : '' });
    const nav = html`<div class="date-nav">
      <button class="icon-btn filled" data-go="${addDays(date, -1)}" aria-label="Día anterior">${icon('left')}</button>
      <div class="label">${fmtLong(date)}<small>${relative(date, t)}</small></div>
      <button class="icon-btn filled" data-go="${addDays(date, 1)}" aria-label="Día siguiente">${icon('right')}</button>
    </div>`;

    if (!d) {
      el.innerHTML = String(html`${dietTabs('menu')}${nav}
        <div class="card empty">${icon('utensils', 40)}<p class="strong">Sin dieta para este día</p>
        <p class="small mt-s">Importa la dieta que te prepare Claude desde Ajustes.</p></div>
        ${date <= t ? waterCard(date) : ''}`);
      bindNav();
      bindWater(el, ctx.refresh);
      return;
    }

    const tipo = d.tipo;
    const obj = d.plan.data.objetivos;
    const kcal = tipo.kcal ?? obj.kcal, prot = tipo.proteina ?? obj.proteina, carb = tipo.carbohidratos ?? obj.carbohidratos, fat = tipo.grasas ?? obj.grasas;
    const log = dietLog(date);
    const adh = dietAdherence(date);
    const editable = date <= t;

    el.innerHTML = String(html`
      ${dietTabs('menu')}
      ${nav}
      ${date !== t ? html`<button class="btn small ghost block mb" data-go="${t}">Volver a hoy</button>` : ''}
      <div class="card">
        <div class="card-head"><div class="card-icon ok">${icon('utensils', 20)}</div><h3>${tipo.nombre}</h3>
          ${editable ? html`<span class="small muted">${adh.done}/${adh.total}</span>` : html`<span class="chip">Próximamente</span>`}</div>
        ${kcal || prot ? html`<div class="macros">
          <div><div class="v">${kcal != null ? fmtNum(kcal, 0) : '–'}</div><div class="l">kcal</div></div>
          <div><div class="v">${prot != null ? `${fmtNum(prot, 0)}g` : '–'}</div><div class="l">Proteína</div></div>
          <div><div class="v">${carb != null ? `${fmtNum(carb, 0)}g` : '–'}</div><div class="l">Carbos</div></div>
          <div><div class="v">${fat != null ? `${fmtNum(fat, 0)}g` : '–'}</div><div class="l">Grasas</div></div>
        </div>` : ''}
        ${editable ? html`<div class="mt">${bar(adh.pct, 'var(--ok)')}</div>` : ''}
        ${tipo.notas || d.plan.data.notas ? html`<p class="small muted mt">${tipo.notas || d.plan.data.notas}</p>` : ''}
      </div>

      ${tipo.comidas.map((c, i) => html`<div class="card meal ${log.done[i] ? 'eaten' : ''}">
        <div class="meal-head">
          ${editable ? html`<button class="meal-check ${log.done[i] ? 'on' : ''}" data-meal="${i}" aria-label="Marcar ${c.nombre} como hecha" aria-pressed="${!!log.done[i]}">${icon('check', 18)}</button>` : ''}
          <div class="grow"><div class="strong">${c.nombre}</div>${c.hora || c.kcal ? html`<div class="small muted">${[c.hora, c.kcal ? `${c.kcal} kcal` : ''].filter(Boolean).join(' · ')}</div>` : ''}</div>
        </div>
        <div class="mt-s">${c.alimentos.map((a) => html`<div class="food"><span>${a.nombre}${a.notas ? html` <span class="muted small">(${a.notas})</span>` : ''}</span><span class="q">${fmtQty(a.cantidad, a.unidad)}</span></div>`)}</div>
        ${c.notas ? html`<p class="small muted mt-s">${c.notas}</p>` : ''}
      </div>`)}

      ${editable ? waterCard(date) : ''}
      ${editable ? html`<div class="card"><label class="field"><span>Notas del día (saltos, cambios, hambre…)</span>
        <textarea data-note placeholder="Claude verá estas notas en el export">${log.notas || ''}</textarea></label></div>` : ''}
    `);

    bindNav();
    bindWater(el, ctx.refresh);
    el.querySelectorAll('[data-meal]').forEach((b) => {
      b.onclick = async () => {
        vibrate(15);
        await toggleMeal(date, Number(b.dataset.meal));
        ctx.refresh();
      };
    });
    const note = el.querySelector('[data-note]');
    if (note) {
      let tmo;
      note.oninput = () => { clearTimeout(tmo); tmo = setTimeout(() => setDietNote(date, note.value.trim()), 400); };
    }

    function bindNav() {
      el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => ctx.go(`dieta?fecha=${b.dataset.go}`); });
    }
  },
};
