// Progreso: peso y grasa, perímetros, fotos (con comparador) y evolución de fuerza por ejercicio.
import { S, series, PERIMETROS, POSES, deleteMeasurement, deletePhoto } from '../store.js';
import { html, icon, fmtNum, fmtSigned, openSheet, confirmDialog, toast } from '../ui.js';
import { today, diffDays, fmtDMY, fmtShort, fmtLong } from '../dates.js';
import { lineChart, movingAverage } from '../charts.js';
import { openMeasurementSheet, openPhotoSheet } from '../widgets.js';

let tab = 'peso';
let perim = 'cintura';
let exercise = null;

function delta(points, days) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const ref = [...points].reverse().find((p) => diffDays(p.date, last.date) >= days);
  return ref ? last.value - ref.value : null;
}

function pesoTab() {
  const pts = series('peso');
  const last = pts[pts.length - 1];
  const target = S.profile.pesoObjetivo;
  const grasa = series('grasa');
  return html`
    <div class="card">
      <div class="grid3">
        <div class="stat"><span class="v">${last ? fmtNum(last.value) : '–'}</span><span class="l">kg actual</span></div>
        <div class="stat"><span class="v">${fmtSigned(delta(pts, 7), 1)}</span><span class="l">7 días</span></div>
        <div class="stat"><span class="v">${pts.length > 1 ? fmtSigned(last.value - pts[0].value, 1) : '–'}</span><span class="l">Total</span></div>
      </div>
      <div class="mt">${lineChart(pts, { unit: ' kg', target, trend: pts.length > 3 ? movingAverage(pts, 7) : null, label: 'Evolución del peso' })}</div>
      ${pts.length > 3 ? html`<p class="tiny muted">Línea gruesa: media de 7 días (más fiable que el peso diario).</p>` : ''}
      ${grasa.length ? html`<div class="row between mt"><span class="small">Grasa corporal</span><span class="strong">${fmtNum(grasa[grasa.length - 1].value)} %
        ${grasa.length > 1 ? html`<span class="muted small">(${fmtSigned(grasa[grasa.length - 1].value - grasa[0].value, 1, ' %')})</span>` : ''}</span></div>` : ''}
    </div>
    <button class="btn primary block mt" data-measure>${icon('scale', 20)} Registrar peso y medidas</button>
    <div class="section-title">Historial</div>
    <div class="card">${S.measurements.length ? html`<div class="list">${[...S.measurements].reverse().map((m) => html`<div class="list-item">
        <div class="grow"><div>${fmtDMY(m.date)}</div><div class="small muted">${[m.peso != null ? `${fmtNum(m.peso)} kg` : '', m.grasa != null ? `${fmtNum(m.grasa)} % grasa` : '',
          Object.keys(m.perimetros || {}).length ? `${Object.keys(m.perimetros).length} perímetros` : ''].filter(Boolean).join(' · ')}</div></div>
        <button class="icon-btn" data-edit="${m.date}" aria-label="Editar">${icon('edit', 18)}</button>
        <button class="icon-btn" data-del="${m.date}" aria-label="Borrar">${icon('trash', 18)}</button></div>`)}</div>`
      : html`<p class="small muted">Aún no hay registros.</p>`}</div>`;
}

function perimTab() {
  const avail = PERIMETROS.filter(([k]) => series(k).length);
  if (!avail.length) {
    return html`<div class="card empty">${icon('ruler', 40)}<p class="strong">Sin perímetros</p><p class="small mt-s">Mide cintura, cadera, pecho… siempre en el mismo punto.</p></div>
      <button class="btn primary block mt" data-measure-p>${icon('ruler', 20)} Registrar perímetros</button>`;
  }
  if (!avail.some(([k]) => k === perim)) perim = avail[0][0];
  const pts = series(perim);
  return html`
    <div class="row wrap gap-s mb">${avail.map(([k, l]) => html`<button class="chip ${k === perim ? 'pending' : ''}" data-perim="${k}">${l}</button>`)}</div>
    <div class="card">${lineChart(pts, { unit: ' cm', label: `Evolución de ${perim}` })}</div>
    <div class="card"><div class="list">${avail.map(([k, l]) => {
      const s = series(k);
      const ch = s.length > 1 ? s[s.length - 1].value - s[0].value : null;
      return html`<div class="list-item"><div class="grow">${l}</div><span class="strong">${fmtNum(s[s.length - 1].value)} cm</span>
        <span class="small ${ch < 0 ? 'ok-text' : ch > 0 ? 'warn-text' : 'muted'}" style="min-width:56px;text-align:right">${ch != null ? fmtSigned(ch, 1) : ''}</span></div>`;
    })}</div></div>
    <button class="btn primary block mt" data-measure-p>${icon('ruler', 20)} Registrar perímetros</button>`;
}

function fotosTab(urls) {
  const dates = [...new Set(S.photos.map((p) => p.date))].reverse();
  return html`
    <div class="grid2 mb"><button class="btn primary" data-photo>${icon('camera', 20)} Añadir fotos</button>
      <button class="btn ghost" data-compare ${dates.length < 2 ? 'disabled' : ''}>${icon('swap', 20)} Comparar</button></div>
    ${!dates.length ? html`<div class="card empty">${icon('image', 40)}<p class="strong">Sin fotos</p><p class="small mt-s">Haz fotos de frente, perfil y espalda cada 4 semanas.</p></div>` : ''}
    ${dates.map((d) => html`<div class="section-title">${fmtLong(d)}</div><div class="photo-grid">
      ${S.photos.filter((p) => p.date === d).map((p) => html`<button data-view="${p.id}"><img src="${urls.get(p.id)}" alt="Foto ${p.pose} ${d}" loading="lazy"><span class="cap">${POSES.find(([k]) => k === p.pose)?.[1] || p.pose}</span></button>`)}
    </div>`)}`;
}

function exerciseNames() {
  const names = new Map();
  for (const w of S.workouts) for (const e of w.exercises || []) if (e.sets.some((s) => s.done && s.peso != null)) names.set(e.nombre.trim().toLowerCase(), e.nombre.trim());
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

function fuerzaTab() {
  const names = exerciseNames();
  if (!names.length) return html`<div class="card empty">${icon('dumbbell', 40)}<p class="strong">Sin datos de fuerza</p><p class="small mt-s">Registra entrenos con kilos para ver tu progresión.</p></div>`;
  if (!exercise || !names.includes(exercise)) exercise = names[0];
  const key = exercise.toLowerCase();
  const rows = [];
  for (const w of S.workouts) {
    const e = w.exercises?.find((x) => x.nombre.trim().toLowerCase() === key);
    const done = e?.sets.filter((s) => s.done && s.peso != null) || [];
    if (!done.length) continue;
    const best = done.reduce((a, s) => (s.peso > a.peso || (s.peso === a.peso && (s.reps || 0) > (a.reps || 0)) ? s : a));
    // 1RM estimado (Epley) para comparar sesiones con distintas repeticiones
    const e1rm = Math.max(...done.map((s) => s.peso * (1 + (s.reps || 1) / 30)));
    rows.push({ date: w.date, best, e1rm, vol: done.reduce((a, s) => a + s.peso * (s.reps || 0), 0) });
  }
  const pts = rows.map((r) => ({ date: r.date, value: Math.round(r.e1rm * 10) / 10 }));
  return html`
    <label class="field mb"><span>Ejercicio</span><select data-ex>${names.map((n) => html`<option ${n === exercise ? 'selected' : ''}>${n}</option>`)}</select></label>
    <div class="card"><div class="small muted mb">1RM estimado (kg)</div>${lineChart(pts, { unit: ' kg', label: `Fuerza en ${exercise}` })}</div>
    <div class="card"><div class="list">${rows.slice(-10).reverse().map((r) => html`<div class="list-item">
      <div class="grow"><div>${fmtDMY(r.date)}</div><div class="small muted">Volumen ${fmtNum(r.vol, 0)} kg</div></div>
      <span class="strong">${r.best.reps ?? '?'} × ${fmtNum(r.best.peso)} kg</span></div>`)}</div></div>`;
}

export default {
  render(el, ctx) {
    ctx.header('Progreso');
    const urls = new Map();
    if (tab === 'fotos') S.photos.forEach((p) => urls.set(p.id, URL.createObjectURL(p.blob)));
    const tabs = [['peso', 'Peso'], ['perim', 'Medidas'], ['fotos', 'Fotos'], ['fuerza', 'Fuerza']];
    el.innerHTML = String(html`
      <div class="seg mb">${tabs.map(([k, l]) => html`<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`)}</div>
      ${tab === 'peso' ? pesoTab() : tab === 'perim' ? perimTab() : tab === 'fotos' ? fotosTab(urls) : fuerzaTab()}`);

    const q = (s) => el.querySelector(s);
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; ctx.refresh(); }; });
    if (q('[data-measure]')) q('[data-measure]').onclick = () => openMeasurementSheet(today(), ctx.refresh);
    if (q('[data-measure-p]')) q('[data-measure-p]').onclick = () => openMeasurementSheet(today(), ctx.refresh, { focus: 'perimetros' });
    el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openMeasurementSheet(b.dataset.edit, ctx.refresh); });
    el.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (await confirmDialog(`Se borrarán las medidas del ${fmtDMY(b.dataset.del)}.`, { ok: 'Borrar', danger: true })) {
          await deleteMeasurement(b.dataset.del); ctx.refresh();
        }
      };
    });
    el.querySelectorAll('[data-perim]').forEach((b) => { b.onclick = () => { perim = b.dataset.perim; ctx.refresh(); }; });
    if (q('[data-ex]')) q('[data-ex]').onchange = (e) => { exercise = e.target.value; ctx.refresh(); };
    if (q('[data-photo]')) q('[data-photo]').onclick = () => openPhotoSheet(today(), ctx.refresh);

    el.querySelectorAll('[data-view]').forEach((b) => {
      b.onclick = () => {
        const p = S.photos.find((x) => x.id === b.dataset.view);
        openSheet({
          title: `${POSES.find(([k]) => k === p.pose)?.[1] || ''} · ${fmtDMY(p.date)}`,
          body: html`<div class="viewer"><img src="${urls.get(p.id)}" alt="Foto de progreso"></div>
            <button class="btn ghost block mt" data-del-photo>${icon('trash', 18)} Borrar foto</button>`,
          onMount(sh, close) {
            sh.querySelector('[data-del-photo]').onclick = async () => {
              if (!(await confirmDialog('La foto se borrará de este móvil.', { ok: 'Borrar', danger: true }))) return;
              await deletePhoto(p.id);
              toast('Foto borrada');
              ctx.refresh();
            };
          },
        });
      };
    });

    if (q('[data-compare]')) q('[data-compare]').onclick = () => {
      const dates = [...new Set(S.photos.map((p) => p.date))];
      let a = dates[0], b = dates[dates.length - 1], pose = 'frente';
      openSheet({
        title: 'Comparar fotos',
        body: html`<div class="grid2"><label class="field"><span>Antes</span><select data-a>${dates.map((d) => html`<option value="${d}" ${d === a ? 'selected' : ''}>${fmtShort(d)}</option>`)}</select></label>
          <label class="field"><span>Después</span><select data-b>${dates.map((d) => html`<option value="${d}" ${d === b ? 'selected' : ''}>${fmtShort(d)}</option>`)}</select></label></div>
          <div class="seg mt" data-pose>${POSES.map(([k, l]) => html`<button data-p="${k}" class="${k === pose ? 'on' : ''}">${l}</button>`)}</div>
          <div class="compare mt" data-out></div><p class="small muted mt-s center" data-diff></p>`,
        onMount(sh) {
          const draw = () => {
            const pa = S.photos.filter((p) => p.date === a && p.pose === pose).pop();
            const pb = S.photos.filter((p) => p.date === b && p.pose === pose).pop();
            const img = (p) => (p ? `<img src="${urls.get(p.id) || (urls.set(p.id, URL.createObjectURL(p.blob)), urls.get(p.id))}" alt="">` : '<div class="chart-empty">Sin foto</div>');
            sh.querySelector('[data-out]').innerHTML = img(pa) + img(pb);
            const wa = S.measurements.find((m) => m.date === a)?.peso, wb = S.measurements.find((m) => m.date === b)?.peso;
            sh.querySelector('[data-diff]').textContent = `${Math.abs(diffDays(a, b))} días de diferencia${wa != null && wb != null ? ` · ${fmtSigned(wb - wa, 1, ' kg')}` : ''}`;
          };
          sh.querySelector('[data-a]').onchange = (e) => { a = e.target.value; draw(); };
          sh.querySelector('[data-b]').onchange = (e) => { b = e.target.value; draw(); };
          sh.querySelectorAll('[data-p]').forEach((btn) => {
            btn.onclick = () => { pose = btn.dataset.p; sh.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('on', x === btn)); draw(); };
          });
          draw();
        },
      });
    };

    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  },
};
