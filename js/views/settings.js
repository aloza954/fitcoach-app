// Ajustes: sincronización con Claude (export/import), planes, perfil, preferencias y copias de seguridad.
import { S, saveProfile, saveSettings, applyPlan, deletePlan, rutinaOn, dietaOn } from '../store.js';
import { html, icon, toast, openSheet, confirmDialog, parseNum, fmtNum } from '../ui.js';
import { today, addDays, fmtDMY, relative, WEEKDAYS, WEEKDAY_LABELS } from '../dates.js';
import { makeExportFiles, markExported, shareFiles, download, readPlanFromFile, parsePlanText, makeBackup, restoreBackup } from '../sync.js';
import { firstMessage } from '../claude-spec.js';
import { wipeAll } from '../db.js';

export const APP_VERSION = '1.0.0';
let exportRange = 'rutina';

function exportFrom(range) {
  const t = today();
  if (range === '4s') return addDays(t, -27);
  if (range === 'todo') {
    const firsts = [S.meta.since, S.rutinas[0]?.fechaInicio, S.measurements[0]?.date, S.workouts[0]?.date].filter(Boolean);
    return firsts.sort()[0] || t;
  }
  return rutinaOn(t)?.fechaInicio || addDays(t, -27);
}

// ---------- Vista previa del plan importado ----------
function weekSummary(semana, items) {
  return WEEKDAYS.map((d, i) => `${WEEKDAY_LABELS[i].slice(0, 3)}: ${semana[d] ? items[semana[d]].nombre : '—'}`).join(' · ');
}

function previewPlan(parsed, ctx) {
  if (!parsed.ok) {
    openSheet({
      title: 'El plan tiene errores',
      body: html`<div class="banner bad">${icon('alert', 20)}<div class="grow">No se ha aplicado nada. Copia estos errores y pásaselos a Claude para que corrija el archivo.</div></div>
        <ul class="small">${parsed.errors.map((e) => html`<li>${e}</li>`)}</ul>
        <button class="btn ghost block mt" data-copy>${icon('copy', 18)} Copiar errores</button>`,
      onMount(el) {
        el.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(`La app FitCoach no pudo importar el plan por estos errores:\n- ${parsed.errors.join('\n- ')}\nCorrígelo y vuelve a enviármelo completo.`).then(() => toast('Errores copiados'));
      },
    });
    return;
  }
  const r = parsed.rutina, d = parsed.dieta;
  openSheet({
    title: 'Nuevo plan de Claude',
    body: html`
      ${parsed.mensaje ? html`<div class="banner info">${icon('sparkles', 20)}<div class="grow small">${parsed.mensaje}</div></div>` : ''}
      ${r ? html`<div class="card"><div class="card-head"><div class="card-icon">${icon('dumbbell', 20)}</div><h3>${r.nombre}</h3></div>
        <div class="small">Desde el <b>${fmtDMY(r.fechaInicio)}</b>${r.fechaFin ? html` hasta el <b>${fmtDMY(r.fechaFin)}</b>` : ''} (${relative(r.fechaInicio)})</div>
        <div class="small muted mt-s">${Object.keys(r.sesiones).length} sesiones · ${r.semanas.length > 1 ? `ciclo de ${r.semanas.length} semanas` : 'semana fija'}</div>
        <div class="tiny muted mt-s">${weekSummary(r.semanas[0], r.sesiones)}</div></div>` : ''}
      ${d ? html`<div class="card"><div class="card-head"><div class="card-icon ok">${icon('utensils', 20)}</div><h3>${d.nombre}</h3></div>
        <div class="small">Desde el <b>${fmtDMY(d.fechaInicio)}</b> (${relative(d.fechaInicio)})</div>
        <div class="small muted mt-s">${Object.keys(d.tiposDia).length} tipos de día${d.objetivos.kcal ? ` · ${fmtNum(d.objetivos.kcal, 0)} kcal` : ''}${d.objetivos.proteina ? ` · ${d.objetivos.proteina} g proteína` : ''}</div>
        <div class="tiny muted mt-s">${weekSummary(d.semanas[0], d.tiposDia)}</div></div>` : ''}
      ${parsed.hitos.length || parsed.hitosRecurrentes ? html`<div class="card"><div class="card-head"><div class="card-icon warn">${icon('flag', 20)}</div><h3>Hitos</h3></div>
        ${parsed.hitos.length ? html`<div class="small">${parsed.hitos.length} hitos nuevos</div>` : ''}
        ${parsed.hitosRecurrentes ? html`<div class="small">${parsed.hitosRecurrentes.map((h) => `${h.titulo} cada ${h.cadaDias} días`).join(' · ')}</div>
          <div class="tiny muted">Sustituyen a los hitos recurrentes actuales.</div>` : ''}</div>` : ''}
      ${parsed.warnings.length ? html`<div class="banner warn mt">${icon('alert', 20)}<div class="grow small">${parsed.warnings.join(' · ')}</div></div>` : ''}
      <p class="tiny muted mt">Tu historial se conserva: los días anteriores al inicio seguirán mostrando el plan que tenías.</p>
      <div class="row gap mt"><button class="btn ghost grow" data-close>Cancelar</button><button class="btn primary grow" data-apply>Aplicar plan</button></div>`,
    onMount(el, close) {
      el.querySelector('[data-apply]').onclick = async () => {
        await applyPlan(parsed);
        await close();
        toast('¡Plan aplicado!', { kind: 'ok' });
        ctx.go('inicio');
      };
    },
  });
}

export default {
  async render(el, ctx) {
    ctx.header('Ajustes y Claude', { back: 'inicio' });
    const t = today();
    const p = S.profile;
    const st = S.settings;
    const from = exportFrom(exportRange);
    const nPhotos = S.photos.filter((f) => f.date >= from).length;
    const plans = [...S.rutinas, ...S.dietas].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
    const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;

    el.innerHTML = String(html`
      <div class="section-title">Tu entrenador: Claude</div>
      <div class="card">
        <div class="card-head"><div class="card-icon">${icon('share', 20)}</div><h3>Enviar progreso a Claude</h3></div>
        <p class="small muted">Genera un archivo con tus entrenos, dieta, agua y medidas, y las instrucciones para que Claude te devuelva el plan en el formato correcto. Adjúntalo en el chat con Claude.</p>
        <div class="seg mt">${[['4s', '4 semanas'], ['rutina', 'Rutina actual'], ['todo', 'Todo']].map(([k, l]) => html`<button data-range="${k}" class="${exportRange === k ? 'on' : ''}">${l}</button>`)}</div>
        <p class="tiny muted mt-s">Desde el ${fmtDMY(from)} hasta hoy.</p>
        <label class="field mt"><span>Comentarios para tu entrenador (opcional)</span>
          <textarea data-comments placeholder="Cómo te has sentido, hambre, sueño, molestias, qué quieres cambiar…"></textarea></label>
        <label class="check-row"><input type="checkbox" data-photos ${nPhotos ? '' : 'disabled'}>
          <span class="small">Incluir fotos del periodo (${nPhotos})</span></label>
        <div class="grid2 mt-s">
          <button class="btn primary" data-share>${icon('share', 18)} Compartir</button>
          <button class="btn ghost" data-download>${icon('download', 18)} Descargar</button>
        </div>
        <p class="tiny muted mt-s">${S.meta.lastExport ? `Último export: ${relative(S.meta.lastExport, t)}.` : 'Aún no has exportado nunca.'} "Compartir" abre el menú de Android (elige la app de Claude). Con fotos, "Descargar" genera un ZIP.</p>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-icon ok">${icon('upload', 20)}</div><h3>Importar plan de Claude</h3></div>
        <p class="small muted">Carga el archivo .json que te dé Claude, o pega el texto si te lo dio como bloque de código.</p>
        <div class="grid2 mt">
          <label class="btn primary">${icon('upload', 18)} Archivo<input type="file" accept=".json,.zip,.txt,application/json,application/zip,text/plain" class="hidden" data-import-file></label>
          <button class="btn ghost" data-paste>${icon('copy', 18)} Pegar texto</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-icon warn">${icon('sparkles', 20)}</div><h3>Primera vez con Claude</h3></div>
        <p class="small muted">Copia un mensaje de presentación con tus datos y las instrucciones del formato. Pégalo en un chat nuevo con Claude para que diseñe tu primer plan.</p>
        <button class="btn ghost block mt" data-copy-intro>${icon('copy', 18)} Copiar instrucciones para Claude</button>
      </div>

      <div class="section-title">Planes</div>
      <div class="card">${plans.length ? html`<div class="list">${plans.map((pl) => {
        const active = (pl.kind === 'rutina' ? rutinaOn(t) : dietaOn(t))?.id === pl.id;
        const future = pl.fechaInicio > t;
        return html`<div class="list-item">
          <div class="card-icon ${pl.kind === 'dieta' ? 'ok' : ''}" style="width:34px;height:34px">${icon(pl.kind === 'rutina' ? 'dumbbell' : 'utensils', 17)}</div>
          <div class="grow"><div class="ellipsis">${pl.nombre}</div><div class="small muted">${fmtDMY(pl.fechaInicio)}${pl.fechaFin ? ` → ${fmtDMY(pl.fechaFin)}` : ''}</div></div>
          <span class="chip ${active ? 'done' : future ? 'planned' : ''}">${active ? 'Activo' : future ? 'Futuro' : 'Anterior'}</span>
          <button class="icon-btn" data-del-plan="${pl.id}" aria-label="Borrar plan">${icon('trash', 18)}</button></div>`;
      })}</div>` : html`<p class="small muted">No hay planes cargados.</p>`}</div>

      <div class="section-title">Perfil</div>
      <form class="card" data-profile autocomplete="off">
        <label class="field"><span>Nombre</span><input type="text" name="nombre" value="${p.nombre || ''}" maxlength="40"></label>
        <div class="grid2 mt">
          <label class="field"><span>Sexo</span><select name="sexo">${['', 'hombre', 'mujer', 'otro'].map((s) => html`<option value="${s}" ${p.sexo === s ? 'selected' : ''}>${s ? s[0].toUpperCase() + s.slice(1) : '—'}</option>`)}</select></label>
          <label class="field"><span>Nacimiento</span><input type="date" name="nacimiento" value="${p.nacimiento || ''}" max="${t}"></label>
          <label class="field"><span>Altura (cm)</span><input type="text" inputmode="numeric" name="alturaCm" value="${p.alturaCm ?? ''}"></label>
          <label class="field"><span>Experiencia</span><select name="experiencia">${['', 'principiante', 'intermedio', 'avanzado'].map((s) => html`<option value="${s}" ${p.experiencia === s ? 'selected' : ''}>${s ? s[0].toUpperCase() + s.slice(1) : '—'}</option>`)}</select></label>
          <label class="field"><span>Peso objetivo (kg)</span><input type="text" inputmode="decimal" name="pesoObjetivo" value="${p.pesoObjetivo ?? ''}"></label>
          <label class="field"><span>Grasa objetivo (%)</span><input type="text" inputmode="decimal" name="grasaObjetivo" value="${p.grasaObjetivo ?? ''}"></label>
        </div>
        <label class="field mt"><span>Objetivo</span><input type="text" name="objetivo" value="${p.objetivo || ''}" placeholder="Ej. perder grasa manteniendo músculo" maxlength="140"></label>
        <label class="field mt"><span>Notas (lesiones, alergias, material…)</span><textarea name="notas" maxlength="600">${p.notas || ''}</textarea></label>
        <button class="btn primary block mt" type="submit">Guardar perfil</button>
      </form>

      <div class="section-title">Preferencias</div>
      <div class="card">
        <div class="field"><span>Tema</span><div class="seg">${[['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([k, l]) => html`<button data-theme="${k}" class="${st.tema === k ? 'on' : ''}">${l}</button>`)}</div></div>
        <label class="field mt"><span>Objetivo de agua si la dieta no lo indica (ml)</span><input type="text" inputmode="numeric" data-water-goal value="${st.aguaObjetivo}"></label>
        <div class="field mt"><span>Botones rápidos de agua (ml)</span><div class="grid3">${st.vasos.map((v, i) => html`<input type="text" inputmode="numeric" data-vaso="${i}" value="${v}">`)}</div></div>
        <label class="check-row mt"><input type="checkbox" data-sound ${st.sonido ? 'checked' : ''}><span class="small">Sonido al terminar el descanso</span></label>
        <button class="btn ghost block mt-s" data-save-prefs>Guardar preferencias</button>
      </div>

      <div class="section-title">Tus datos</div>
      <div class="card">
        <p class="small muted">Todo se guarda solo en este móvil. Haz una copia de seguridad de vez en cuando (incluye las fotos) por si cambias de teléfono o borras los datos del navegador.</p>
        <div class="grid2 mt">
          <button class="btn ghost" data-backup>${icon('download', 18)} Copia</button>
          <label class="btn ghost">${icon('upload', 18)} Restaurar<input type="file" accept=".zip,application/zip" class="hidden" data-restore></label>
        </div>
        <button class="btn ghost block mt-s bad-text" data-wipe>${icon('trash', 18)} Borrar todos los datos</button>
        <p class="tiny muted mt">FitCoach ${APP_VERSION}${est ? ` · ${fmtNum(est.usage / 1048576, 1)} MB usados` : ''}</p>
      </div>
    `);

    const q = (s) => el.querySelector(s);

    // Export
    el.querySelectorAll('[data-range]').forEach((b) => { b.onclick = () => { exportRange = b.dataset.range; ctx.refresh(); }; });
    const doExport = async (mode) => {
      const btn = q(mode === 'share' ? '[data-share]' : '[data-download]');
      btn.disabled = true;
      try {
        const out = await makeExportFiles({ desde: from, hasta: t, comentarios: q('[data-comments]').value.trim(), includePhotos: q('[data-photos]').checked });
        let ok = false;
        if (mode === 'share') ok = await shareFiles(out.files, 'Progreso FitCoach');
        if (!ok) {
          download(out.zip || out.files[0], out.name);
          if (mode === 'share') toast('Tu navegador no permite compartir archivos: se ha descargado');
        }
        await markExported();
        if (mode !== 'share' || ok) toast('Progreso exportado', { kind: 'ok' });
      } catch (e) {
        toast(`No se pudo exportar: ${e.message}`);
      } finally {
        btn.disabled = false;
      }
    };
    q('[data-share]').onclick = () => doExport('share');
    q('[data-download]').onclick = () => doExport('download');

    // Import
    q('[data-import-file]').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 5 * 1048576) { toast('El archivo es demasiado grande para ser un plan'); return; }
      try { previewPlan(await readPlanFromFile(f), ctx); } catch (err) { previewPlan({ ok: false, errors: [err.message], warnings: [] }, ctx); }
    };
    q('[data-paste]').onclick = () => openSheet({
      title: 'Pegar plan',
      body: html`<textarea data-txt style="min-height:220px;font-family:ui-monospace,monospace;font-size:12.5px" placeholder='{"tipo": "fitcoach-plan", ...}'></textarea>
        <div class="grid2 mt"><button class="btn ghost" data-clip>Pegar del portapapeles</button><button class="btn primary" data-go>Revisar</button></div>`,
      onMount(sh, close) {
        const ta = sh.querySelector('[data-txt]');
        sh.querySelector('[data-clip]').onclick = async () => {
          try { ta.value = await navigator.clipboard.readText(); } catch { toast('Mantén pulsado el cuadro y elige "Pegar"'); }
        };
        sh.querySelector('[data-go]').onclick = async () => {
          let parsed;
          try { parsed = parsePlanText(ta.value); } catch (err) { parsed = { ok: false, errors: [err.message], warnings: [] }; }
          await close();
          previewPlan(parsed, ctx);
        };
      },
    });
    q('[data-copy-intro]').onclick = async () => {
      try { await navigator.clipboard.writeText(firstMessage(S.profile)); toast('Copiado. Pégalo en un chat con Claude'); } catch { toast('No se pudo copiar'); }
    };

    // Planes
    el.querySelectorAll('[data-del-plan]').forEach((b) => {
      b.onclick = async () => {
        const pl = plans.find((x) => x.id === b.dataset.delPlan);
        if (await confirmDialog(`Se borrará "${pl.nombre}". Los entrenos registrados se conservan, pero los días de ese plan dejarán de aparecer como programados.`, { ok: 'Borrar plan', danger: true })) {
          await deletePlan(pl.id);
          ctx.refresh();
        }
      };
    });

    // Perfil
    q('[data-profile]').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      await saveProfile({
        nombre: f.nombre.value.trim(), sexo: f.sexo.value, nacimiento: f.nacimiento.value || '',
        alturaCm: parseNum(f.alturaCm.value), experiencia: f.experiencia.value,
        pesoObjetivo: parseNum(f.pesoObjetivo.value), grasaObjetivo: parseNum(f.grasaObjetivo.value),
        objetivo: f.objetivo.value.trim(), notas: f.notas.value.trim(),
      });
      toast('Perfil guardado', { kind: 'ok' });
    };

    // Preferencias
    el.querySelectorAll('[data-theme]').forEach((b) => {
      b.onclick = async () => {
        await saveSettings({ tema: b.dataset.theme });
        window.dispatchEvent(new Event('fitcoach:theme'));
        ctx.refresh();
      };
    });
    q('[data-save-prefs]').onclick = async () => {
      const goal = parseNum(q('[data-water-goal]').value);
      const vasos = [...el.querySelectorAll('[data-vaso]')].map((i) => parseNum(i.value)).filter((v) => v > 0 && v <= 3000).map(Math.round);
      if (!goal || goal < 500 || goal > 8000) { toast('El objetivo de agua debe estar entre 500 y 8000 ml'); return; }
      if (vasos.length !== 3) { toast('Los botones de agua deben estar entre 1 y 3000 ml'); return; }
      await saveSettings({ aguaObjetivo: Math.round(goal), vasos, sonido: q('[data-sound]').checked });
      toast('Preferencias guardadas', { kind: 'ok' });
    };

    // Datos
    q('[data-backup]').onclick = async () => {
      try {
        const blob = await makeBackup();
        download(blob, `fitcoach-copia-${t}.zip`);
        toast('Copia de seguridad descargada', { kind: 'ok' });
      } catch (e) { toast(`Error: ${e.message}`); }
    };
    q('[data-restore]').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!(await confirmDialog('Se sustituirán TODOS los datos actuales por los de la copia.', { ok: 'Restaurar', danger: true }))) return;
      try {
        await restoreBackup(f);
        window.dispatchEvent(new Event('fitcoach:theme'));
        toast('Copia restaurada', { kind: 'ok' });
        ctx.go('inicio');
      } catch (err) { toast(`No se pudo restaurar: ${err.message}`); }
    };
    q('[data-wipe]').onclick = async () => {
      if (!(await confirmDialog('Se borrarán entrenos, dieta, medidas, fotos y planes de este móvil. No se puede deshacer.', { ok: 'Continuar', danger: true }))) return;
      if (!(await confirmDialog('¿Has hecho una copia de seguridad? Esta es la última confirmación.', { ok: 'Borrar todo', danger: true, title: 'Última confirmación' }))) return;
      await wipeAll();
      location.hash = '';
      location.reload();
    };
  },
};
