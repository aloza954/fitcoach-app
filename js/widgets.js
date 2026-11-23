// Componentes reutilizados por varias pantallas: agua, detalle de un día, medidas, fotos y hitos.
import {
  S, waterTotal, waterGoal, waterEntries, addWater, removeWater, sessionOn, trainingStatus, logsScheduledFor,
  extrasOn, markMissed, deleteWorkout, hitosBetween, addHito, deleteHito, dietAdherence, measurementOn,
  saveMeasurement, savePhoto, PERIMETROS, POSES, rutinaOn,
} from './store.js';
import { STATUS_LABEL, HITO_TYPES, tipoLabel } from './plans.js';
import { html, icon, ring, fmtMl, fmtNum, toast, openSheet, confirmDialog, parseNum, vibrate } from './ui.js';
import { today, fmtLong, isValidISO } from './dates.js';

// ---------- Estados e iconos ----------
export function statusChip(st) {
  return html`<span class="chip ${st}">${st === 'recovered' ? icon('redo', 13) : ''}${STATUS_LABEL[st] || st}</span>`;
}

export const HITO_ICON = { inicio: 'flag', fin: 'flag', fotos: 'camera', pesaje: 'scale', perimetros: 'ruler', revision: 'sparkles', otro: 'info' };

export function hitoRow(h, { showDate = false, deletable = false } = {}) {
  const tone = h.hecho ? 'ok' : h.tipo === 'fin' ? 'warn' : '';
  return html`<div class="hito">
    <div class="card-icon ${tone}">${icon(h.hecho ? 'check' : HITO_ICON[h.tipo] || 'info', 18)}</div>
    <div class="grow">
      <div class="strong">${h.titulo}</div>
      <div class="small muted">${showDate ? fmtLong(h.fecha) : tipoLabel(h.tipo)}${h.hecho ? ' · hecho' : ''}${h.nota ? ` · ${h.nota}` : ''}</div>
    </div>
    ${deletable && h.id ? html`<button class="icon-btn" data-del-hito="${h.id}" aria-label="Borrar hito">${icon('trash', 18)}</button>` : ''}
  </div>`;
}

// ---------- Agua ----------
export function waterCard(date) {
  const total = waterTotal(date), goal = waterGoal(date);
  const pct = total / goal;
  return html`<div class="card" data-water="${date}">
    <div class="water-card">
      <div class="ring-wrap">${ring(pct, { size: 76, stroke: 8, color: 'var(--water)', label: 'Agua' })}
        <div class="ring-label">${Math.round(pct * 100)}%<small>agua</small></div></div>
      <div class="grow">
        <div class="row between"><div class="strong">${fmtMl(total)} <span class="muted small">/ ${fmtMl(goal)}</span></div>
          ${waterEntries(date).length ? html`<button class="icon-btn" data-water-log aria-label="Ver registros de agua">${icon('list', 20)}</button>` : ''}</div>
        <div class="small muted">${total >= goal ? '¡Objetivo cumplido!' : `Te faltan ${fmtMl(goal - total)}`}</div>
        <div class="water-btns">
          ${S.settings.vasos.map((ml) => html`<button class="btn water small" data-water-add="${ml}">+${ml >= 1000 ? `${fmtNum(ml / 1000)} L` : ml}</button>`)}
          <button class="btn water small" data-water-custom aria-label="Otra cantidad">${icon('plus', 18)}</button>
        </div>
      </div>
    </div>
  </div>`;
}

/** Conecta los botones de todas las tarjetas de agua dentro de `root`. */
export function bindWater(root, refresh) {
  root.querySelectorAll('[data-water]').forEach((card) => {
    const date = card.dataset.water;
    card.querySelectorAll('[data-water-add]').forEach((b) => {
      b.onclick = async () => {
        const ml = Number(b.dataset.waterAdd);
        await addWater(date, ml);
        vibrate(15);
        const n = waterEntries(date).length - 1;
        toast(`+${ml} ml de agua`, { action: 'Deshacer', onAction: async () => { await removeWater(date, n); refresh(); } });
        refresh();
      };
    });
    const custom = card.querySelector('[data-water-custom]');
    if (custom) custom.onclick = () => openSheet({
      title: 'Añadir agua',
      body: html`<label class="field"><span>Cantidad (ml)</span><input type="number" inputmode="numeric" id="w-ml" placeholder="Ej. 330"></label>
        <button class="btn primary block mt" id="w-ok">Añadir</button>`,
      onMount(el, close) {
        const inp = el.querySelector('#w-ml');
        setTimeout(() => inp.focus(), 250);
        el.querySelector('#w-ok').onclick = async () => {
          const ml = parseNum(inp.value);
          if (!ml || ml <= 0 || ml > 5000) { toast('Introduce una cantidad entre 1 y 5000 ml'); return; }
          await addWater(date, Math.round(ml));
          close();
          refresh();
        };
      },
    });
    const log = card.querySelector('[data-water-log]');
    if (log) log.onclick = () => openSheet({
      title: `Agua · ${fmtLong(date)}`,
      body: html`<div class="list">${waterEntries(date).map((e, i) => html`<div class="list-item">
          <div class="card-icon water">${icon('droplet', 18)}</div>
          <div class="grow"><div>${e.ml} ml</div><div class="small muted">${new Date(e.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div></div>
          <button class="icon-btn" data-rm="${i}" aria-label="Borrar">${icon('trash', 18)}</button></div>`)}</div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-rm]').forEach((b) => {
          b.onclick = async () => { await removeWater(date, Number(b.dataset.rm)); close(); refresh(); };
        });
      },
    });
  });
}

// ---------- Detalle de un día (calendario, tira semanal) ----------
export function openDaySheet(date, ctx) {
  const ref = today();
  const s = sessionOn(date);
  const st = trainingStatus(date, ref);
  const logs = logsScheduledFor(date);
  const extras = extrasOn(date);
  const missedLog = logs.find((l) => l.status === 'missed');
  const realLogs = logs.filter((l) => l.status !== 'missed');
  const hitos = hitosBetween(date, date);
  const adh = dietAdherence(date);
  const m = measurementOn(date);
  const canLog = s && ['missed', 'pending', 'partial'].includes(st);

  const body = html`
    <div class="card">
      <div class="card-head"><div class="card-icon">${icon('dumbbell', 20)}</div>
        <h3>${s ? s.session.nombre : rutinaOn(date) ? 'Descanso' : 'Sin rutina'}</h3>${s ? statusChip(st) : ''}</div>
      ${missedLog ? html`<p class="small muted">Marcado como no realizado${missedLog.motivo ? `: ${missedLog.motivo}` : ''}.</p>` : ''}
      ${[...realLogs, ...extras].map((w) => html`<div class="list-item">
          <div class="grow"><div>${w.sessionName}${!w.scheduledDate ? ' (extra)' : ''}</div>
          <div class="small muted">${w.date !== date ? `Hecho el ${fmtLong(w.date)} · ` : ''}${Math.round(w.completion * 100)}% completado${w.duracionMin ? ` · ${w.duracionMin} min` : ''}</div></div>
          <button class="btn small ghost" data-open="${w.id}">Ver</button></div>`)}
      <div class="row gap wrap mt-s">
        ${canLog ? html`<button class="btn primary small grow" data-log>${icon('play', 16)} ${date < ref ? 'Registrar / recuperar' : 'Empezar'}</button>` : ''}
        ${s && !missedLog && !realLogs.length && date <= ref ? html`<button class="btn ghost small grow" data-miss>Marcar no realizado</button>` : ''}
        ${missedLog ? html`<button class="btn ghost small" data-unmiss>Quitar marca</button>` : ''}
      </div>
    </div>
    ${adh || waterTotal(date) ? html`<div class="card"><div class="grid2">
      <div class="stat"><span class="v">${adh ? `${adh.done}/${adh.total}` : '–'}</span><span class="l">Comidas hechas</span></div>
      <div class="stat"><span class="v">${fmtMl(waterTotal(date))}</span><span class="l">Agua de ${fmtMl(waterGoal(date))}</span></div>
    </div><button class="btn ghost small block mt" data-diet>Ver dieta del día</button></div>` : ''}
    ${m ? html`<div class="card"><div class="strong mb">Medidas</div>
      <div class="small">${m.peso != null ? `Peso ${fmtNum(m.peso)} kg` : ''}${m.grasa != null ? ` · Grasa ${fmtNum(m.grasa)} %` : ''}</div>
      <div class="small muted">${PERIMETROS.filter(([k]) => m.perimetros?.[k] != null).map(([k, l]) => `${l} ${fmtNum(m.perimetros[k])}`).join(' · ')}</div></div>` : ''}
    <div class="card"><div class="row between"><div class="strong">Hitos</div>
      <button class="btn small ghost" data-add-hito>${icon('plus', 16)} Añadir</button></div>
      ${hitos.length ? hitos.map((h) => hitoRow(h, { deletable: !h.auto && !h.recurrente })) : html`<p class="small muted mt-s">Sin hitos este día.</p>`}
    </div>`;

  openSheet({
    title: fmtLong(date),
    body,
    onMount(el, close) {
      const q = (sel) => el.querySelector(sel);
      if (q('[data-log]')) q('[data-log]').onclick = () => { close().then(() => ctx.go(`sesion?prog=${date}`)); };
      if (q('[data-diet]')) q('[data-diet]').onclick = () => { close().then(() => ctx.go(`dieta?fecha=${date}`)); };
      el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { close().then(() => ctx.go(`sesion?id=${b.dataset.open}`)); }; });
      if (q('[data-miss]')) q('[data-miss]').onclick = () => { close().then(() => openMissSheet(date, ctx.refresh)); };
      if (q('[data-unmiss]')) q('[data-unmiss]').onclick = async () => { await deleteWorkout(missedLog.id); close(); ctx.refresh(); };
      q('[data-add-hito]').onclick = () => { close().then(() => openHitoSheet(date, ctx.refresh)); };
      el.querySelectorAll('[data-del-hito]').forEach((b) => {
        b.onclick = async () => { await deleteHito(b.dataset.delHito); close(); ctx.refresh(); toast('Hito borrado'); };
      });
    },
  });
}

export function openMissSheet(date, refresh) {
  const reasons = ['Enfermedad', 'Lesión', 'Trabajo', 'Viaje', 'Cansancio', 'Otro'];
  openSheet({
    title: 'No realizado',
    body: html`<p class="muted small">Quedará en rojo en el calendario y Claude lo verá en el export. Siempre podrás recuperarlo otro día.</p>
      <div class="row wrap gap-s mt">${reasons.map((r) => html`<button class="chip" data-r="${r}">${r}</button>`)}</div>
      <label class="field mt"><span>Motivo (opcional)</span><input type="text" id="miss-r" maxlength="140"></label>
      <button class="btn danger block mt" id="miss-ok">Marcar como no realizado</button>`,
    onMount(el, close) {
      const inp = el.querySelector('#miss-r');
      el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { inp.value = b.dataset.r; }; });
      el.querySelector('#miss-ok').onclick = async () => {
        await markMissed(date, sessionOn(date), inp.value.trim());
        close();
        refresh();
      };
    },
  });
}

export function openHitoSheet(date, refresh) {
  openSheet({
    title: 'Nuevo hito',
    body: html`<label class="field"><span>Fecha</span><input type="date" id="h-date" value="${date}"></label>
      <label class="field mt"><span>Tipo</span><select id="h-tipo">${HITO_TYPES.map((t) => html`<option value="${t}">${tipoLabel(t)}</option>`)}</select></label>
      <label class="field mt"><span>Título</span><input type="text" id="h-tit" maxlength="80" placeholder="Opcional"></label>
      <button class="btn primary block mt" id="h-ok">Guardar</button>`,
    onMount(el, close) {
      el.querySelector('#h-ok').onclick = async () => {
        const fecha = el.querySelector('#h-date').value;
        if (!isValidISO(fecha)) { toast('Fecha no válida'); return; }
        const tipo = el.querySelector('#h-tipo').value;
        await addHito({ fecha, tipo, titulo: el.querySelector('#h-tit').value.trim() || tipoLabel(tipo) });
        close();
        refresh();
        toast('Hito añadido');
      };
    },
  });
}

// ---------- Medidas ----------
export function openMeasurementSheet(date, refresh, { focus = 'peso' } = {}) {
  const m = measurementOn(date) || {};
  const per = m.perimetros || {};
  openSheet({
    title: 'Registrar medidas',
    body: html`<form id="m-form" autocomplete="off">
      <label class="field"><span>Fecha</span><input type="date" name="date" value="${date}" max="${today()}"></label>
      <div class="measure-grid mt">
        <label class="field"><span>Peso (kg)</span><input type="text" inputmode="decimal" name="peso" value="${m.peso ?? ''}" placeholder="72,5"></label>
        <label class="field"><span>Grasa (%)</span><input type="text" inputmode="decimal" name="grasa" value="${m.grasa ?? ''}" placeholder="Opcional"></label>
      </div>
      <div class="section-title" id="m-per">Perímetros (cm)</div>
      <div class="measure-grid">
        ${PERIMETROS.map(([k, l]) => html`<label class="field"><span>${l}</span><input type="text" inputmode="decimal" name="p_${k}" value="${per[k] ?? ''}"></label>`)}
      </div>
      <label class="field mt"><span>Notas</span><input type="text" name="notas" value="${m.notas || ''}" placeholder="Ej. en ayunas, tras el baño"></label>
      <button class="btn primary block mt" type="submit">Guardar</button>
      <p class="tiny muted mt-s">Consejo: pésate en ayunas, tras ir al baño y siempre en las mismas condiciones.</p>
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('#m-form');
      if (focus === 'perimetros') setTimeout(() => el.querySelector('#m-per').scrollIntoView({ behavior: 'smooth' }), 300);
      else setTimeout(() => form.peso.focus(), 300);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const d = form.date.value;
        if (!isValidISO(d) || d > today()) { toast('Fecha no válida'); return; }
        const perimetros = {};
        for (const [k] of PERIMETROS) { const v = parseNum(form[`p_${k}`].value); if (v != null) perimetros[k] = v; }
        const peso = parseNum(form.peso.value), grasa = parseNum(form.grasa.value);
        if (peso != null && (peso < 25 || peso > 350)) { toast('El peso parece incorrecto'); return; }
        if (grasa != null && (grasa < 2 || grasa > 70)) { toast('El % de grasa parece incorrecto'); return; }
        if (peso == null && grasa == null && !Object.keys(perimetros).length) { toast('Introduce al menos un valor'); return; }
        await saveMeasurement({ date: d, peso, grasa, perimetros, notas: form.notas.value.trim() });
        close();
        refresh();
        toast('Medidas guardadas', { kind: 'ok' });
      };
    },
  });
}

// ---------- Fotos ----------
async function compressImage(file, maxSide = 1440, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { blob, w, h };
}

export function openPhotoSheet(date, refresh) {
  let pose = 'frente';
  let changed = false;
  const sheet = openSheet({
    title: 'Fotos de progreso',
    body: html`<label class="field"><span>Fecha</span><input type="date" id="ph-date" value="${date}" max="${today()}"></label>
      <div class="field mt"><span>Pose</span><div class="seg" id="ph-pose">${POSES.map(([k, l]) => html`<button type="button" data-p="${k}" class="${k === pose ? 'on' : ''}">${l}</button>`)}</div></div>
      <div class="grid2 mt">
        <label class="btn primary">${icon('camera', 20)} Cámara<input type="file" accept="image/*" capture="environment" class="hidden" data-file></label>
        <label class="btn ghost">${icon('image', 20)} Galería<input type="file" accept="image/*" class="hidden" data-file></label>
      </div>
      <p class="small muted mt" id="ph-status">Misma luz, misma distancia y misma ropa en cada sesión para poder comparar.</p>`,
    onMount(el) {
      const seg = el.querySelector('#ph-pose');
      const setPose = (p) => { pose = p; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === p)); };
      seg.querySelectorAll('button').forEach((b) => { b.onclick = () => setPose(b.dataset.p); });
      el.querySelectorAll('[data-file]').forEach((inp) => {
        inp.onchange = async () => {
          const file = inp.files[0];
          inp.value = '';
          if (!file) return;
          const d = el.querySelector('#ph-date').value;
          if (!isValidISO(d)) { toast('Fecha no válida'); return; }
          const status = el.querySelector('#ph-status');
          status.textContent = 'Procesando…';
          try {
            const { blob, w, h } = await compressImage(file);
            await savePhoto({ date: d, pose, blob, w, h });
            const idx = POSES.findIndex(([k]) => k === pose);
            status.textContent = `Foto de ${POSES[idx][1].toLowerCase()} guardada (${Math.round(blob.size / 1024)} KB).${idx < POSES.length - 1 ? ' Siguiente pose:' : ''}`;
            if (idx < POSES.length - 1) setPose(POSES[idx + 1][0]);
            changed = true;
          } catch (e) {
            status.textContent = `No se pudo procesar la imagen: ${e.message}`;
          }
        };
      });
    },
  });
  // Refrescar la pantalla al cerrar (no antes: refrescar cierra las hojas abiertas)
  sheet.onClose = () => { if (changed) refresh(); };
}

