// Inicio: estado del día y resumen del progreso.
import {
  S, sessionOn, trainingStatus, pendingRecoveries, rutinaOn, currentOrNextRutina, dietOn, dietAdherence,
  series, trainingAdherence, streak, hitosBetween, logsScheduledFor,
} from '../store.js';
import { html, icon, bar, fmtNum, fmtSigned } from '../ui.js';
import { today, addDays, startOfWeek, WEEKDAY_SHORT, fmtLong, relative, diffDays } from '../dates.js';
import { sparkline } from '../charts.js';
import {
  statusChip, waterCard, bindWater, openDaySheet, hitoRow, openMeasurementSheet, openPhotoSheet,
} from '../widgets.js';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

function banners(t) {
  const out = [];
  const msg = S.mensajes[0];
  if (msg && diffDays(msg.fecha, t) <= 7) {
    out.push(html`<div class="banner info">${icon('sparkles', 20)}<div class="grow"><div class="strong">Nota de tu entrenador</div><div class="small">${msg.texto}</div></div></div>`);
  }
  if (S.draft) {
    out.push(html`<div class="banner warn">${icon('timer', 20)}<div class="grow">Tienes <b>${S.draft.sessionName}</b> a medias.</div>
      <a class="btn small" href="#/sesion">Continuar</a></div>`);
  }
  const rec = pendingRecoveries(7, t);
  if (rec.length) {
    const first = rec[rec.length - 1];
    out.push(html`<div class="banner bad">${icon('alert', 20)}<div class="grow">${rec.length === 1
      ? html`No hiciste <b>${first.session.nombre}</b> (${relative(first.date, t)}).`
      : html`Tienes <b>${rec.length} entrenos</b> sin hacer esta semana.`}</div>
      <a class="btn small" href="#/sesion?prog=${first.date}">Recuperar</a></div>`);
  }
  const r = rutinaOn(t);
  if (!r) {
    const next = currentOrNextRutina(t);
    out.push(next
      ? html`<div class="banner info">${icon('flag', 20)}<div class="grow"><b>${next.nombre}</b> empieza ${relative(next.fechaInicio, t)}.</div></div>`
      : html`<div class="banner warn">${icon('upload', 20)}<div class="grow">No tienes una rutina activa. Exporta tu progreso y pide un plan nuevo a Claude.</div>
        <a class="btn small" href="#/ajustes">Ir</a></div>`);
  } else if (r.fechaFin && diffDays(t, r.fechaFin) <= 7) {
    out.push(html`<div class="banner warn">${icon('flag', 20)}<div class="grow">Tu rutina termina ${relative(r.fechaFin, t)}. Es buen momento para pedir la siguiente a Claude.</div>
      <a class="btn small" href="#/ajustes">Exportar</a></div>`);
  }
  if (S.meta.lastExport == null || diffDays(S.meta.lastExport, t) > 14) {
    if (diffDays(S.meta.since || t, t) >= 7) {
      out.push(html`<div class="banner info">${icon('share', 20)}<div class="grow">${S.meta.lastExport ? `Último export a Claude ${relative(S.meta.lastExport, t)}.` : 'Aún no has enviado tu progreso a Claude.'}</div>
        <a class="btn small" href="#/ajustes">Exportar</a></div>`);
    }
  }
  return out;
}

function todayCard(t) {
  const s = sessionOn(t);
  const st = trainingStatus(t, t);
  if (!s) {
    return html`<div class="card hero">
      <div class="row between"><span class="small muted">Entreno de hoy</span>${icon('moon', 20)}</div>
      <div class="big mt-s">${rutinaOn(t) ? 'Descanso' : 'Sin rutina'}</div>
      <p class="small muted mt-s">${rutinaOn(t) ? 'Recupera bien: camina, estira y duerme 7-9 h.' : 'Importa un plan desde Ajustes.'}</p>
      <div class="row gap mt"><a class="btn small" href="#/sesion?extra=1">${icon('plus', 16)} Entreno extra</a></div>
    </div>`;
  }
  const ses = s.session;
  const nSeries = ses.ejercicios.reduce((a, e) => a + e.series, 0);
  const estMin = Math.round(ses.ejercicios.reduce((a, e) => a + e.series * (45 + e.descansoSeg), 0) / 60);
  const log = logsScheduledFor(t).find((l) => l.status !== 'missed');
  const drafting = S.draft && S.draft.scheduledDate === t;
  return html`<div class="card hero">
    <div class="row between"><span class="small muted">Entreno de hoy</span>${statusChip(st)}</div>
    <div class="big mt-s">${ses.nombre}</div>
    <p class="small muted mt-s">${ses.ejercicios.length} ejercicios · ${nSeries} series · ~${estMin} min</p>
    <div class="row gap mt">
      ${log ? html`<a class="btn solid grow" href="#/sesion?id=${log.id}">${icon('check', 18)} Ver registro</a>`
        : html`<a class="btn solid grow" href="#/sesion?prog=${t}">${icon('play', 18)} ${drafting ? 'Continuar' : 'Empezar'}</a>`}
      <a class="btn" href="#/entreno">Ver rutina</a>
    </div>
  </div>`;
}

function weekStrip(t) {
  const ws = startOfWeek(t);
  const adh = trainingAdherence(ws, addDays(ws, 6), t);
  const planned = WEEKDAY_SHORT.filter((_, i) => sessionOn(addDays(ws, i))).length;
  return html`<div class="card"><div class="card-head"><h3>Esta semana</h3>
      <span class="small muted">${adh.hechos + adh.recuperados} de ${planned} hechos</span></div>
    <div class="week-strip">${WEEKDAY_SHORT.map((l, i) => {
      const d = addDays(ws, i);
      const st = trainingStatus(d, t);
      const s = sessionOn(d);
      const initials = s ? s.session.nombre.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('') : '';
      const ic = st === 'done' || st === 'recovered' ? icon('check', 16) : st === 'missed' ? icon('x', 16) : st === 'partial' ? icon('minus', 16) : initials || '·';
      return html`<button class="d ${d === t ? 'today' : ''}" data-day="${d}" style="background:none;border:0;padding:0;cursor:pointer">
        <span>${l}</span><span class="dot st-${st}">${ic}</span></button>`;
    })}</div></div>`;
}

function todayHitos(t) {
  const hs = hitosBetween(t, t).filter((h) => ['pesaje', 'perimetros', 'fotos'].includes(h.tipo));
  if (!hs.length) return '';
  return html`<div class="card"><div class="card-head"><div class="card-icon warn">${icon('target', 20)}</div><h3>Hoy toca</h3></div>
    ${hs.map((h) => html`<div class="row gap">${hitoRow(h)}${h.hecho ? '' : html`<button class="btn small primary" data-hito-act="${h.tipo}">Registrar</button>`}</div>`)}
  </div>`;
}

function dietCard(t) {
  const d = dietOn(t);
  if (!d) return html`<a class="card tappable row gap" href="#/dieta" style="text-decoration:none;color:inherit">
    <div class="card-icon">${icon('utensils', 20)}</div><div class="grow"><div class="strong">Dieta</div><div class="small muted">Sin dieta asignada para hoy</div></div>${icon('right')}</a>`;
  const adh = dietAdherence(t);
  const log = S.dietLogs.get(t);
  const nextIdx = d.tipo.comidas.findIndex((_, i) => !log?.done?.[i]);
  const next = d.tipo.comidas[nextIdx];
  return html`<a class="card tappable" href="#/dieta" style="display:block;text-decoration:none;color:inherit">
    <div class="card-head"><div class="card-icon ok">${icon('utensils', 20)}</div>
      <h3>${d.tipo.nombre}</h3><span class="small muted">${adh.done}/${adh.total} comidas</span></div>
    ${bar(adh.pct, 'var(--ok)')}
    <div class="row between mt">
      <div class="small">${next ? html`Siguiente: <b>${next.nombre}</b>${next.hora ? ` · ${next.hora}` : ''}` : '¡Todas las comidas hechas!'}</div>
      ${d.tipo.kcal || d.plan.data.objetivos.kcal ? html`<span class="chip">${fmtNum(d.tipo.kcal || d.plan.data.objetivos.kcal, 0)} kcal</span>` : ''}
    </div></a>`;
}

function progressCard(t) {
  const peso = series('peso');
  const last = peso[peso.length - 1];
  const weekAgo = [...peso].reverse().find((p) => diffDays(p.date, t) >= 7);
  const adh = trainingAdherence(addDays(t, -29), t, t);
  const str = streak(t);
  const target = S.profile.pesoObjetivo;
  return html`<a class="card tappable" href="#/progreso" style="display:block;text-decoration:none;color:inherit">
    <div class="card-head"><div class="card-icon">${icon('chart', 20)}</div><h3>Progreso</h3>${icon('right')}</div>
    <div class="grid3">
      <div class="stat"><span class="v">${last ? fmtNum(last.value) : '–'}</span><span class="l">kg ${last ? `· ${relative(last.date, t)}` : ''}</span></div>
      <div class="stat"><span class="v">${adh.pct != null ? `${adh.pct}%` : '–'}</span><span class="l">Entrenos 30 d</span></div>
      <div class="stat"><span class="v">${str}</span><span class="l">Racha ${icon('flame', 12)}</span></div>
    </div>
    ${peso.length > 1 ? html`<div class="row between mt">
      <div class="small muted">${weekAgo ? html`7 días: <b>${fmtSigned(last.value - weekAgo.value, 1, ' kg')}</b> · ` : ''}Total: <b>${fmtSigned(last.value - peso[0].value, 1, ' kg')}</b>
        ${target ? html`<br>Faltan ${fmtNum(Math.abs(last.value - target))} kg para tu objetivo` : ''}</div>
      ${sparkline(peso.slice(-14).map((p) => p.value))}</div>` : html`<p class="small muted mt">Registra tu peso para ver la tendencia.</p>`}
  </a>`;
}

function upcoming(t) {
  const hs = hitosBetween(addDays(t, 1), addDays(t, 21)).slice(0, 4);
  if (!hs.length) return '';
  return html`<div class="section-title">Próximos hitos</div><div class="card">${hs.map((h) => hitoRow(h, { showDate: true }))}</div>`;
}

export default {
  render(el, ctx) {
    const t = today();
    ctx.header(`${greeting()}${S.profile.nombre ? `, ${S.profile.nombre}` : ''}`, { sub: fmtLong(t) });
    el.innerHTML = String(html`
      ${banners(t)}
      ${todayCard(t)}
      ${todayHitos(t)}
      ${waterCard(t)}
      ${dietCard(t)}
      ${weekStrip(t)}
      ${progressCard(t)}
      ${upcoming(t)}
    `);
    bindWater(el, ctx.refresh);
    el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => openDaySheet(b.dataset.day, ctx); });
    el.querySelectorAll('[data-hito-act]').forEach((b) => {
      b.onclick = () => {
        const tipo = b.dataset.hitoAct;
        if (tipo === 'fotos') openPhotoSheet(t, ctx.refresh);
        else openMeasurementSheet(t, ctx.refresh, { focus: tipo === 'perimetros' ? 'perimetros' : 'peso' });
      };
    });
  },
};
