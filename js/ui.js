// Utilidades de interfaz: plantillas HTML con escapado, iconos, toasts y hojas inferiores.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** Marca un texto como HTML seguro (no se escapa). Úsalo solo con contenido generado por la app. */
export const raw = (s) => new Raw(s);

export function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function val(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}

/** Plantilla etiquetada: escapa todas las interpolaciones salvo las envueltas en raw() o html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += val(v) + strings[i + 1]; });
  return new Raw(out);
}

export function fmtNum(n, dec = 1) {
  if (n == null || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
}

export function fmtSigned(n, dec = 1, unit = '') {
  if (n == null || Number.isNaN(n)) return '–';
  const s = n > 0 ? '+' : n < 0 ? '−' : '±';
  return `${s}${fmtNum(Math.abs(n), dec)}${unit}`;
}

export function fmtMl(ml) {
  return ml >= 1000 ? `${fmtNum(ml / 1000, 2)} L` : `${Math.round(ml)} ml`;
}

// ---------- Iconos (trazos de 24x24, estilo línea) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  utensils: '<path d="M4 2.5v7a3 3 0 0 0 3 3v9M7 2.5v6M10 2.5v7a3 3 0 0 1-3 3"/><path d="M17 21.5v-19c-2.5 1.5-4 4.5-4 8v3h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  droplet: '<path d="M12 2.7s-6.5 7-6.5 11.8a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.7 12 2.7z"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  camera: '<path d="M4 7.5h3l2-2.5h6l2 2.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8.5a6 6 0 0 1 8 0l-2.5 3h-3z"/>',
  ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h3l2.5 12.5h11L21 7H7"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  alert: '<path d="M12 3 2 20.5h20z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  flame: '<path d="M12 21.5a7 7 0 0 0 7-7c0-4-3-6.5-4-10-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3C7 9 5 11.5 5 14.5a7 7 0 0 0 7 7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  redo: '<path d="M20 8h-9a6 6 0 0 0 0 12h4"/><path d="m16 4 4 4-4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  bolt: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
};

export function icon(name, size = 22, extraClass = '') {
  return raw(`<svg class="ico ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
}

/** Anillo de progreso SVG. pct 0..1 (se recorta visualmente a 1). */
export function ring(pct, { size = 64, stroke = 7, color = 'var(--accent)', track = 'var(--track)', label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  return raw(`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .5s ease"/>
  </svg>`);
}

export function bar(pct, color = 'var(--accent)') {
  const p = Math.max(0, Math.min(1, pct || 0));
  return raw(`<div class="bar"><span style="width:${(p * 100).toFixed(1)}%;background:${color}"></span></div>`);
}

// ---------- Toast ----------
let toastTimer = null;
export function toast(message, { action, onAction, kind = '' } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast show ${kind}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction && onAction(); };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2400);
}

// ---------- Hoja inferior (bottom sheet) ----------
// Se integra con el botón "atrás" de Android: abrir añade una entrada al historial y "atrás" la cierra.
const sheetStack = [];

window.addEventListener('popstate', () => {
  const top = sheetStack[sheetStack.length - 1];
  if (top) top.close(true);
});

export function openSheet({ title = '', body = '', onMount, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      ${title ? `<header class="sheet-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></header>` : ''}
      <div class="sheet-body">${String(body)}</div>
    </section>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const entry = {
    /** Cierra la hoja. Devuelve una promesa que se resuelve cuando el historial ya se ha restaurado,
     *  para poder navegar a otra pantalla sin condiciones de carrera con history.back(). */
    close(fromPop = false) {
      if (closed) return Promise.resolve();
      closed = true;
      sheetStack.splice(sheetStack.indexOf(entry), 1);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 250);
      let done = Promise.resolve();
      if (!fromPop) {
        done = new Promise((resolve) => {
          const t = setTimeout(resolve, 400);
          window.addEventListener('popstate', () => { clearTimeout(t); resolve(); }, { once: true });
        });
        history.back();
      }
      return done.then(() => { entry.onClose && entry.onClose(); });
    },
    el: wrap.querySelector('.sheet'),
  };
  sheetStack.push(entry);
  history.pushState({ sheet: true }, '');

  wrap.querySelector('.sheet-backdrop').onclick = () => entry.close();
  wrap.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => entry.close(); });
  onMount && onMount(entry.el, () => entry.close(), entry);
  return entry;
}

/** Cierra todas las hojas sin tocar el historial (se usa al cambiar de pantalla). */
export function closeAllSheets() {
  while (sheetStack.length) {
    const top = sheetStack[sheetStack.length - 1];
    top.onClose = null;
    top.close(true);
  }
}

export function confirmDialog(message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false, title = '¿Seguro?' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title,
      body: html`<p class="muted">${message}</p>
        <div class="row gap mt">
          <button class="btn ghost grow" data-no>${cancel}</button>
          <button class="btn ${danger ? 'danger' : 'primary'} grow" data-yes>${ok}</button>
        </div>`,
      onMount(el, close) {
        // Resolver tras restaurar el historial: así se puede abrir otra hoja justo después sin que se cierre sola
        el.querySelector('[data-yes]').onclick = () => { answered = true; close().then(() => resolve(true)); };
        el.querySelector('[data-no]').onclick = () => { answered = true; close().then(() => resolve(false)); };
      },
    });
    s.onClose = () => { if (!answered) resolve(false); };
  });
}

/** Lee los valores de un formulario como objeto plano. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value.replace(',', '.'));
    else out[el.name] = el.value.trim();
  }
  return out;
}

/** Convierte "72,5" o "72.5" en número; devuelve null si está vacío o no es válido. */
export function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function vibrate(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* sin soporte */ }
}
