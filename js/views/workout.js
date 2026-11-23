// Entreno: semana actual, sesiones de la rutina, entrenos por recuperar e historial.
import { S, sessionOn, trainingStatus, pendingRecoveries, currentOrNextRutina } from '../store.js';
import { weekOfCycle } from '../plans.js';
import { html, icon } from '../ui.js';
import { today, addDays, startOfWeek, WEEKDAY_LABELS, fmtShort, fmtLong, relative, diffDays, fmtDMY } from '../dates.js';
import { statusChip, openDaySheet } from '../widgets.js';

export function exerciseMeta(e) {
  return html`<span class="chip">${e.series} × ${e.reps}</span>
    ${e.peso != null ? html`<span class="chip">${e.peso} kg</span>` : ''}
    ${e.descansoSeg ? html`<span class="chip">${icon('timer', 13)} ${e.descansoSeg >= 60 ? `${Math.floor(e.descansoSeg / 60)}:${String(e.descansoSeg % 60).padStart(2, '0')}` : `${e.descansoSeg} s`}</span>` : ''}
    ${e.rir ? html`<span class="chip">RIR ${e.rir}</span>` : ''}
    ${e.tempo ? html`<span class="chip">Tempo ${e.tempo}</span>` : ''}
    ${e.superserie ? html`<span class="chip pending">Superserie ${e.superserie}</span>` : ''}`;
}

function sessionDetails(plan, ses) {
  return html`<details class="card">
    <summary class="row gap" style="list-style:none;cursor:pointer">
      <div class="card-icon">${icon('dumbbell', 20)}</div>
      <div class="grow"><div class="strong">${ses.nombre}</div><div class="small muted">${ses.ejercicios.length} ejercicios</div></div>
      ${icon('right', 20)}
    </summary>
    ${ses.calentamiento ? html`<p class="small muted mt">Calentamiento: ${ses.calentamiento}</p>` : ''}
    ${ses.notas ? html`<p class="small muted mt-s">${ses.notas}</p>` : ''}
    <div class="list mt-s">${ses.ejercicios.map((e) => html`<div class="list-item" style="display:block">
      <div class="strong">${e.nombre}</div><div class="ex-meta">${exerciseMeta(e)}</div>
      ${e.notas ? html`<div class="small muted mt-s">${e.notas}</div>` : ''}</div>`)}</div>
    <a class="btn ghost small block mt-s" href="#/sesion?extra=${encodeURIComponent(ses.id)}">${icon('plus', 16)} Hacerla hoy como extra</a>
  </details>`;
}

export default {
  render(el, ctx) {
    const t = today();
    const plan = currentOrNextRutina(t);
    const ws = startOfWeek(t);
    const sub = plan
      ? `${plan.nombre} · semana ${Math.max(1, Math.floor(diffDays(plan.fechaInicio, t) / 7) + 1)}${plan.fechaFin ? ` de ${Math.ceil((diffDays(plan.fechaInicio, plan.fechaFin) + 1) / 7)}` : ''}`
      : 'Sin rutina';
    ctx.header('Entreno', { sub });

    if (!plan) {
      el.innerHTML = String(html`<div class="card empty">${icon('dumbbell', 40)}<p class="strong">Aún no tienes rutina</p>
        <p class="small mt-s">Pide a Claude un plan y cárgalo desde Ajustes → Importar plan.</p>
        <a class="btn primary mt" href="#/ajustes">Importar plan</a></div>`);
      return;
    }

    const rec = pendingRecoveries(14, t);
    const history = S.workouts.filter((w) => w.status !== 'missed').slice(-12).reverse();
    const cycle = plan.data.semanas.length > 1 && plan.fechaInicio <= t ? ` · ciclo ${weekOfCycle(plan, t) + 1}/${plan.data.semanas.length}` : '';

    el.innerHTML = String(html`
      ${plan.fechaInicio > t ? html`<div class="banner info">${icon('flag', 20)}<div class="grow">Esta rutina empieza el ${fmtLong(plan.fechaInicio)}.</div></div>` : ''}
      ${rec.length ? html`<div class="card"><div class="card-head"><div class="card-icon bad">${icon('redo', 20)}</div><h3>Por recuperar</h3></div>
        ${rec.slice().reverse().map((r) => html`<div class="list-item"><div class="grow"><div>${r.session.nombre}</div>
          <div class="small muted">${fmtLong(r.date)} · ${relative(r.date, t)}</div></div>
          <a class="btn small primary" href="#/sesion?prog=${r.date}">Recuperar</a></div>`)}
        <p class="tiny muted mt-s">Al recuperarlo, el día original queda marcado como recuperado y el export indicará cuándo lo hiciste.</p></div>` : ''}

      <div class="section-title">Esta semana${cycle}</div>
      <div class="card"><div class="list">${WEEKDAY_LABELS.map((l, i) => {
        const d = addDays(ws, i);
        const s = sessionOn(d);
        const st = trainingStatus(d, t);
        return html`<button class="list-item" data-day="${d}" style="background:none;border:0;border-bottom:1px solid var(--border);width:100%;text-align:left;cursor:pointer;color:inherit">
          <div style="width:44px" class="${d === t ? 'strong' : 'muted'} small">${l.slice(0, 3)}<br>${fmtShort(d)}</div>
          <div class="grow"><div>${s ? s.session.nombre : 'Descanso'}</div></div>${s ? statusChip(st) : ''}</button>`;
      })}</div></div>

      <div class="section-title">Sesiones de la rutina</div>
      ${plan.data.notas ? html`<div class="banner info">${icon('info', 20)}<div class="grow small">${plan.data.notas}</div></div>` : ''}
      ${Object.values(plan.data.sesiones).map((s) => sessionDetails(plan, s))}

      <div class="section-title">Historial</div>
      <div class="card">${history.length ? html`<div class="list">${history.map((w) => html`<a class="list-item" href="#/sesion?id=${w.id}" style="text-decoration:none;color:inherit">
          <div class="grow"><div>${w.sessionName}</div><div class="small muted">${fmtDMY(w.date)}${w.scheduledDate && w.scheduledDate !== w.date ? ` · recupera el ${fmtShort(w.scheduledDate)}` : ''}${!w.scheduledDate ? ' · extra' : ''}${w.duracionMin ? ` · ${w.duracionMin} min` : ''}</div></div>
          <span class="chip ${w.status}">${Math.round(w.completion * 100)}%</span></a>`)}</div>`
        : html`<p class="small muted">Todavía no has registrado ningún entreno.</p>`}</div>
    `);
    el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => openDaySheet(b.dataset.day, ctx); });
  },
};
