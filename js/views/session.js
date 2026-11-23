// Registro de una sesión de entrenamiento: series, pesos, temporizador de descanso y guardado.
// Rutas:
//   #/sesion?prog=AAAA-MM-DD  -> sesión programada ese día (hoy o recuperar un día pasado)
//   #/sesion?extra=<id>|1     -> sesión extra (elige sesión si extra=1)
//   #/sesion?id=<workoutId>   -> ver/editar un registro existente
//   #/sesion                  -> continuar el borrador en curso
import {
  S, sessionOn, newWorkoutFrom, saveDraft, clearDraft, saveWorkout, deleteWorkout, lastPerformance,
  workoutCompletion, currentOrNextRutina, logsScheduledFor,
} from '../store.js';
import { html, icon, bar, toast, openSheet, confirmDialog, parseNum, vibrate, fmtNum } from '../ui.js';
import { today, fmtLong, fmtShort, isValidISO } from '../dates.js';
import { exerciseMeta } from './workout.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** "6-8" -> 8, "10" -> 10, "45 s" -> null */
function defaultReps(target) {
  if (!/^\s*\d+(\s*[-–]\s*\d+)?\s*$/.test(target || '')) return null;
  const nums = String(target).match(/\d+/g).map(Number);
  return nums[nums.length - 1];
}

// ---------- Temporizador de descanso ----------
function createTimer() {
  const elT = document.createElement('div');
  elT.className = 'timer';
  elT.innerHTML = `<div class="grow"><div class="tiny" data-l style="opacity:.75">Descanso</div><div class="t" data-t>0:00</div></div>
    <button data-a="-15">−15</button><button data-a="15">+15</button><button data-a="skip">Saltar</button>`;
  document.body.appendChild(elT);
  let end = 0, iv = null, hideT = null, audio = null;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const beep = () => {
    if (!S.settings.sonido) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((off) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; g.gain.value = 0.15;
        o.connect(g); g.connect(audio.destination);
        o.start(audio.currentTime + off); o.stop(audio.currentTime + off + 0.15);
      });
    } catch { /* sin audio */ }
  };
  const stop = () => { clearInterval(iv); iv = null; elT.classList.remove('show', 'done'); };
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    elT.querySelector('[data-t]').textContent = fmt(left);
    if (left <= 0 && iv) {
      clearInterval(iv); iv = null;
      elT.classList.add('done');
      elT.querySelector('[data-l]').textContent = '¡A por la siguiente serie!';
      vibrate([250, 120, 250]);
      beep();
      hideT = setTimeout(stop, 6000);
    }
  };
  elT.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'skip') return stop();
      end += Number(a) * 1000;
      if (!iv) { elT.classList.remove('done'); iv = setInterval(tick, 250); }
      tick();
    };
  });
  return {
    start(seconds) {
      clearTimeout(hideT);
      end = Date.now() + seconds * 1000;
      elT.classList.remove('done');
      elT.querySelector('[data-l]').textContent = 'Descanso';
      elT.classList.add('show');
      clearInterval(iv);
      iv = setInterval(tick, 250);
      tick();
    },
    destroy() { stop(); clearTimeout(hideT); elT.remove(); audio && audio.close && audio.close(); },
  };
}

// ---------- Vista ----------
function exerciseCard(w, i) {
  const e = w.exercises[i];
  const o = e.objetivo || {};
  const last = lastPerformance(e.nombre, w.date, w.id);
  const doneCount = e.sets.filter((s) => s.done).length;
  const complete = doneCount >= (o.series || e.sets.length);
  return html`<div class="card ex-card ${complete ? 'complete' : ''}" data-ex-card="${i}">
    <div class="ex-head">
      <div class="grow"><h3>${e.nombre}</h3><div class="ex-meta">${exerciseMeta(o)}</div></div>
      <span class="chip ${complete ? 'done' : ''}">${doneCount}/${o.series || e.sets.length}</span>
    </div>
    ${o.notas ? html`<div class="small muted mt-s">${o.notas}</div>` : ''}
    ${last ? html`<div class="last-perf">${icon('clock', 13)} Última vez (${fmtShort(last.date)}): ${last.sets.map((s) => `${s.reps ?? '?'}${s.peso != null ? `×${fmtNum(s.peso)}` : ''}`).join(' · ')}</div>` : ''}
    <div class="set-grid">
      <span class="h">#</span><span class="h">Reps</span><span class="h">Kg</span><span class="h"></span>
      ${e.sets.map((s, j) => html`
        <span class="n">${j + 1}</span>
        <input type="text" inputmode="numeric" data-f="reps" data-ex="${i}" data-set="${j}" value="${s.reps ?? ''}" placeholder="${last?.sets[j]?.reps ?? o.reps ?? ''}" aria-label="Repeticiones serie ${j + 1}" class="${s.done ? 'set-row-done' : ''}">
        <input type="text" inputmode="decimal" data-f="peso" data-ex="${i}" data-set="${j}" value="${s.peso ?? ''}" placeholder="–" aria-label="Kilos serie ${j + 1}" class="${s.done ? 'set-row-done' : ''}">
        <button class="set-check ${s.done ? 'on' : ''}" data-check data-ex="${i}" data-set="${j}" aria-label="Serie ${j + 1} hecha" aria-pressed="${s.done}">${icon('check', 22)}</button>`)}
    </div>
    <div class="row gap-s mt-s">
      <button class="btn small ghost" data-add-set="${i}">${icon('plus', 15)} Serie</button>
      ${e.sets.length > 1 ? html`<button class="btn small ghost" data-rm-set="${i}">${icon('minus', 15)} Serie</button>` : ''}
      <input type="text" data-note="${i}" value="${e.notas || ''}" placeholder="Nota del ejercicio" style="min-height:36px;flex:1;font-size:13.5px">
    </div>
  </div>`;
}

function pickSession(el, ctx) {
  const plan = currentOrNextRutina(today());
  if (!plan) { ctx.go('entreno'); return; }
  ctx.header('Entreno extra', { back: 'entreno' });
  el.innerHTML = String(html`<p class="muted mb">¿Qué sesión vas a hacer hoy? Quedará registrada como entreno extra (no sustituye a ningún día programado).</p>
    ${Object.values(plan.data.sesiones).map((s) => html`<a class="card tappable row gap" style="text-decoration:none;color:inherit" href="#/sesion?extra=${encodeURIComponent(s.id)}">
      <div class="card-icon">${icon('dumbbell', 20)}</div><div class="grow"><div class="strong">${s.nombre}</div><div class="small muted">${s.ejercicios.length} ejercicios</div></div>${icon('right')}</a>`)}`);
}

export default {
  async render(el, ctx) {
    const p = ctx.params;
    const t = today();
    let w, mode; // mode: 'draft' | 'edit'

    if (p.id) {
      const found = S.workouts.find((x) => x.id === p.id);
      if (!found) { toast('Registro no encontrado'); ctx.go('entreno'); return; }
      w = clone(found);
      mode = 'edit';
    } else if (p.prog || p.extra) {
      const matchesDraft = S.draft && (p.prog ? S.draft.scheduledDate === p.prog : !S.draft.scheduledDate && S.draft.sessionId === p.extra);
      if (S.draft && !matchesDraft) {
        ctx.header('Entreno', { back: 'entreno' });
        el.innerHTML = String(html`<div class="card"><div class="strong">Tienes otro entreno a medias</div>
          <p class="small muted mt-s">${S.draft.sessionName} · empezado el ${fmtLong(S.draft.startedAt.slice(0, 10))}</p>
          <div class="row gap mt"><a class="btn primary grow" href="#/sesion">Continuarlo</a><button class="btn ghost grow" data-discard>Descartarlo</button></div></div>`);
        el.querySelector('[data-discard]').onclick = async () => { await clearDraft(); ctx.refresh(); };
        return;
      }
      if (matchesDraft) {
        w = S.draft;
      } else if (p.prog) {
        if (!isValidISO(p.prog)) { ctx.go('entreno'); return; }
        const s = sessionOn(p.prog);
        if (!s) { toast('Ese día no tiene sesión programada'); ctx.go('entreno'); return; }
        const existing = logsScheduledFor(p.prog).find((l) => l.status === 'done');
        if (existing) { ctx.go(`sesion?id=${existing.id}`); return; }
        w = newWorkoutFrom(s, { scheduledDate: p.prog, date: t });
      } else {
        if (p.extra === '1') return pickSession(el, ctx);
        const plan = currentOrNextRutina(t);
        const ses = plan?.data.sesiones[p.extra];
        if (!ses) return pickSession(el, ctx);
        w = newWorkoutFrom({ plan, session: ses }, { scheduledDate: null, date: t });
      }
      mode = 'draft';
    } else if (S.draft) {
      w = S.draft;
      mode = 'draft';
    } else {
      ctx.go('entreno');
      return;
    }

    const persist = () => { if (mode === 'draft') saveDraft(w); };
    if (mode === 'draft') await saveDraft(w);

    const sub = w.scheduledDate && w.scheduledDate !== t && mode === 'draft'
      ? `Recupera el del ${fmtShort(w.scheduledDate)}`
      : !w.scheduledDate ? 'Entreno extra' : fmtLong(w.scheduledDate);
    ctx.header(w.sessionName, {
      sub, back: 'entreno',
      actions: mode === 'draft' ? html`<button class="icon-btn" data-discard aria-label="Descartar entreno">${icon('trash', 20)}</button>` : '',
    });

    const totalSets = () => w.exercises.reduce((a, e) => a + (e.objetivo?.series || e.sets.length), 0);
    const doneSets = () => w.exercises.reduce((a, e) => a + Math.min(e.objetivo?.series || e.sets.length, e.sets.filter((s) => s.done).length), 0);

    el.innerHTML = String(html`
      <div class="card">
        <div class="row between"><span class="strong" data-prog-l>${doneSets()}/${totalSets()} series</span>
          <span class="small muted" data-elapsed></span></div>
        <div class="mt-s" data-prog-bar>${bar(doneSets() / totalSets(), 'var(--ok)')}</div>
        ${w.scheduledDate && w.scheduledDate < t || mode === 'edit' ? html`
          <label class="field mt"><span>Fecha en que lo hiciste</span>
            <input type="date" data-date value="${w.date}" max="${t}" ${w.scheduledDate ? html`min="${w.scheduledDate}"` : ''}></label>
          ${w.scheduledDate && w.scheduledDate < t ? html`<p class="tiny muted mt-s">Si lo hiciste el ${fmtShort(w.scheduledDate)} pero no lo registraste, pon esa fecha.</p>` : ''}` : ''}
      </div>
      <div data-exs>${w.exercises.map((_, i) => exerciseCard(w, i))}</div>
      <div class="card">
        <label class="field"><span>Esfuerzo percibido de la sesión: <b data-rpe-l>${w.esfuerzo ?? 7}</b>/10</span>
          <input type="range" min="1" max="10" step="1" value="${w.esfuerzo ?? 7}" data-rpe style="accent-color:var(--accent)"></label>
        ${mode === 'edit' ? html`<label class="field mt"><span>Duración (min)</span><input type="number" inputmode="numeric" data-dur value="${w.duracionMin ?? ''}"></label>` : ''}
        <label class="field mt"><span>Notas para tu entrenador</span><textarea data-notes placeholder="Sensaciones, molestias, cambios de ejercicio…">${w.notas || ''}</textarea></label>
      </div>
      <button class="btn ok block mt" data-finish>${icon('check', 20)} ${mode === 'edit' ? 'Guardar cambios' : 'Terminar entreno'}</button>
      ${mode === 'edit' ? html`<button class="btn ghost block mt-s" data-delete>${icon('trash', 18)} Borrar registro</button>` : ''}
      <div style="height:90px" aria-hidden="true"></div>
    `);

    const timer = createTimer();
    let wakeLock = null;
    if (mode === 'draft' && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
    }
    const elapsedEl = el.querySelector('[data-elapsed]');
    const tickElapsed = () => {
      if (mode !== 'draft') { elapsedEl.textContent = w.duracionMin ? `${w.duracionMin} min` : ''; return; }
      const min = Math.floor((Date.now() - new Date(w.startedAt)) / 60000);
      elapsedEl.textContent = `${min} min`;
    };
    tickElapsed();
    const elapsedIv = setInterval(tickElapsed, 30000);

    const updateProgress = () => {
      el.querySelector('[data-prog-l]').textContent = `${doneSets()}/${totalSets()} series`;
      el.querySelector('[data-prog-bar]').innerHTML = String(bar(doneSets() / totalSets(), 'var(--ok)'));
    };
    const rerenderEx = (i) => {
      const card = el.querySelector(`[data-ex-card="${i}"]`);
      card.outerHTML = String(exerciseCard(w, i));
    };

    // Delegación de eventos para toda la vista
    el.addEventListener('input', (ev) => {
      const tg = ev.target;
      if (tg.dataset.f) {
        const s = w.exercises[tg.dataset.ex].sets[tg.dataset.set];
        s[tg.dataset.f] = parseNum(tg.value);
        persist();
      } else if (tg.dataset.note !== undefined) {
        w.exercises[tg.dataset.note].notas = tg.value;
        persist();
      } else if (tg.hasAttribute('data-rpe')) {
        w.esfuerzo = Number(tg.value);
        el.querySelector('[data-rpe-l]').textContent = w.esfuerzo;
        persist();
      } else if (tg.hasAttribute('data-notes')) {
        w.notas = tg.value;
        persist();
      } else if (tg.hasAttribute('data-dur')) {
        w.duracionMin = parseNum(tg.value);
      }
    });
    el.addEventListener('change', (ev) => {
      if (ev.target.hasAttribute('data-date')) {
        const v = ev.target.value;
        if (isValidISO(v) && v <= t && (!w.scheduledDate || v >= w.scheduledDate)) { w.date = v; persist(); }
        else { ev.target.value = w.date; toast('Fecha no válida'); }
      }
    });
    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-check')) {
        const i = Number(b.dataset.ex), j = Number(b.dataset.set);
        const e = w.exercises[i];
        const s = e.sets[j];
        s.done = !s.done;
        if (s.done && s.reps == null) {
          const inp = el.querySelector(`input[data-f="reps"][data-ex="${i}"][data-set="${j}"]`);
          s.reps = parseNum(inp.placeholder) ?? defaultReps(e.objetivo?.reps);
        }
        rerenderEx(i);
        updateProgress();
        persist();
        if (s.done) {
          vibrate(20);
          // En superseries no se descansa hasta terminar el último ejercicio del grupo
          const grp = e.objetivo?.superserie;
          const nextSame = grp && w.exercises[i + 1]?.objetivo?.superserie === grp;
          const rest = e.objetivo?.descansoSeg;
          if (rest && !nextSame) timer.start(rest);
        }
      } else if (b.dataset.addSet !== undefined) {
        const e = w.exercises[b.dataset.addSet];
        const prev = e.sets[e.sets.length - 1];
        e.sets.push({ reps: null, peso: prev?.peso ?? null, done: false });
        rerenderEx(Number(b.dataset.addSet));
        persist();
      } else if (b.dataset.rmSet !== undefined) {
        const e = w.exercises[b.dataset.rmSet];
        e.sets.pop();
        rerenderEx(Number(b.dataset.rmSet));
        updateProgress();
        persist();
      } else if (b.hasAttribute('data-finish')) {
        await finish();
      } else if (b.hasAttribute('data-delete')) {
        if (await confirmDialog('Se borrará este registro de entreno.', { ok: 'Borrar', danger: true })) {
          await deleteWorkout(w.id);
          toast('Registro borrado');
          ctx.go('entreno');
        }
      }
    });
    const discardBtn = document.querySelector('#hdr [data-discard]');
    if (discardBtn) discardBtn.onclick = async () => {
      if (await confirmDialog('Se perderán las series registradas en este entreno.', { ok: 'Descartar', danger: true })) {
        await clearDraft();
        ctx.go('entreno');
      }
    };

    async function finish() {
      const comp = workoutCompletion(w);
      if (comp === 0) { toast('Marca al menos una serie como hecha'); return; }
      if (comp < 0.999 && mode === 'draft') {
        const ok = await confirmDialog(`Has completado el ${Math.round(comp * 100)}% de las series. Quedará como parcial (ámbar en el calendario).`, { ok: 'Terminar igualmente', title: 'Entreno incompleto' });
        if (!ok) return;
      }
      if (mode === 'draft') {
        w.duracionMin = Math.max(1, Math.round((Date.now() - new Date(w.startedAt)) / 60000));
        if (w.esfuerzo == null) w.esfuerzo = Number(el.querySelector('[data-rpe]').value);
      }
      const record = clone(w);
      delete record.startedAt;
      const prs = await saveWorkout(record);
      if (mode === 'draft') await clearDraft();
      if (mode === 'edit') { toast('Cambios guardados', { kind: 'ok' }); ctx.go('entreno'); return; }
      const sheet = openSheet({
        title: comp >= 0.999 ? '¡Entreno completado!' : 'Entreno guardado',
        body: html`<div class="center col gap" style="align-items:center">
          <div class="card-icon ok" style="width:64px;height:64px;border-radius:20px">${icon(comp >= 0.999 ? 'trophy' : 'check', 32)}</div>
          <div class="big">${Math.round(comp * 100)}%</div>
          <div class="muted">${record.duracionMin} min · esfuerzo ${record.esfuerzo}/10</div></div>
          ${prs.length ? html`<div class="banner ok mt">${icon('trophy', 20)}<div class="grow"><b>¡Nuevos récords!</b><br>${prs.map((r) => `${r.nombre}: ${fmtNum(r.peso)} kg (antes ${fmtNum(r.anterior)})`).join(' · ')}</div></div>` : ''}
          <button class="btn primary block mt" data-close>Volver al inicio</button>`,
      });
      sheet.onClose = () => ctx.go('inicio');
    }

    return () => {
      timer.destroy();
      clearInterval(elapsedIv);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  },
};
