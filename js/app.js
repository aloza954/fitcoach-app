// Punto de entrada: arranque, enrutado por hash, cabecera, navegación inferior y onboarding.
import { S, loadAll, saveMeta, saveProfile, applyPlan } from './store.js';
import { html, icon, toast, closeAllSheets } from './ui.js';
import { today, startOfWeek } from './dates.js';
import { validatePlan } from './plans.js';
import { examplePlan } from './claude-spec.js';
import dashboard from './views/dashboard.js';
import workout from './views/workout.js';
import session from './views/session.js';
import calendar from './views/calendar.js';
import diet from './views/diet.js';
import shopping from './views/shopping.js';
import progress from './views/progress.js';
import settings from './views/settings.js';

const ROUTES = {
  inicio: dashboard,
  entreno: workout,
  sesion: session,
  calendario: calendar,
  dieta: diet,
  compra: shopping,
  progreso: progress,
  ajustes: settings,
};

const TABS = [
  ['inicio', 'Inicio', 'home'],
  ['entreno', 'Entreno', 'dumbbell'],
  ['calendario', 'Calendario', 'calendar'],
  ['dieta', 'Dieta', 'utensils'],
  ['progreso', 'Progreso', 'chart'],
];
// Pantallas secundarias que resaltan una pestaña principal
const TAB_OF = { sesion: 'entreno', compra: 'dieta', ajustes: null };

const root = document.getElementById('app');
let current = { name: null, cleanup: null };
let lastDay = today();

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: ROUTES[path] ? path : 'inicio', params };
}

export function go(path) {
  const target = `#/${path}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function applyTheme() {
  const t = S.settings.tema;
  if (t === 'claro') document.documentElement.dataset.theme = 'light';
  else if (t === 'oscuro') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

function shell(name) {
  const active = name in TAB_OF ? TAB_OF[name] : name;
  root.innerHTML = String(html`
    <header class="app-header" id="hdr"></header>
    <main id="view"></main>
    <nav class="bottom-nav" aria-label="Navegación principal">
      ${TABS.map(([id, label, ic]) => html`<a href="#/${id}" class="${id === active ? 'active' : ''}" ${id === active ? html`aria-current="page"` : ''}>${icon(ic, 22)}<span>${label}</span></a>`)}
    </nav>`);
}

/** Contexto que reciben las vistas. */
function makeCtx(name, params) {
  return {
    params,
    go,
    refresh: () => render({ keepScroll: true }),
    header(title, { sub = '', back = null, actions = '' } = {}) {
      const hdr = document.getElementById('hdr');
      hdr.innerHTML = String(html`
        ${back ? html`<button class="icon-btn" data-back aria-label="Volver">${icon('left')}</button>` : ''}
        <h1>${title}${sub ? html`<span class="sub">${sub}</span>` : ''}</h1>
        ${actions}
        ${name !== 'ajustes' ? html`<a class="icon-btn" href="#/ajustes" aria-label="Ajustes y Claude">${icon('settings')}</a>` : ''}`);
      const b = hdr.querySelector('[data-back]');
      if (b) b.onclick = () => go(back);
    },
  };
}

async function render({ keepScroll = false } = {}) {
  closeAllSheets();
  if (!S.meta.onboarded) return renderOnboarding();
  const { name, params } = parseHash();
  const y = window.scrollY;
  if (current.cleanup) { try { current.cleanup(); } catch { /* ignorar */ } }
  shell(name);
  const view = document.getElementById('view');
  if (!keepScroll) view.classList.add('fade-in'); // sin animación al refrescar la misma pantalla
  current = { name, cleanup: null };
  try {
    current.cleanup = await ROUTES[name].render(view, makeCtx(name, params)) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = String(html`<div class="card"><h2>Algo ha fallado</h2><p class="muted mt-s">${e.message}</p></div>`);
  }
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---------- Primer arranque ----------
function renderOnboarding() {
  root.innerHTML = String(html`
    <div class="onboard fade-in">
      <div class="logo">${icon('bolt', 38)}</div>
      <h1>Bienvenido a FitCoach</h1>
      <p class="muted mt-s">Tu rutina, tu dieta, el agua y tu progreso en un solo sitio, con Claude como entrenador.</p>
      <label class="field mt"><span>¿Cómo te llamas?</span><input type="text" id="ob-name" autocomplete="given-name" placeholder="Tu nombre"></label>
      <div class="stack mt">
        <button class="btn primary block" data-start="ejemplo">${icon('sparkles', 20)} Empezar con un plan de ejemplo</button>
        <button class="btn ghost block" data-start="vacio">Empezar sin plan (importaré el de Claude)</button>
      </div>
      <p class="tiny muted mt">Tus datos se guardan solo en este móvil. Desde Ajustes podrás exportarlos para Claude e importar los planes que te prepare.</p>
    </div>`);
  root.querySelectorAll('[data-start]').forEach((b) => {
    b.onclick = async () => {
      const nombre = root.querySelector('#ob-name').value.trim();
      await saveProfile({ ...S.profile, nombre });
      if (b.dataset.start === 'ejemplo') {
        const parsed = validatePlan(examplePlan(startOfWeek(today())));
        if (parsed.ok) await applyPlan(parsed);
      }
      await saveMeta({ onboarded: true, since: today() });
      location.hash = b.dataset.start === 'vacio' ? '#/ajustes' : '#/inicio';
      render();
      if (b.dataset.start === 'vacio') toast('Importa aquí el plan que te dé Claude');
    };
  });
}

// ---------- Arranque ----------
async function boot() {
  try {
    await loadAll();
  } catch (e) {
    root.innerHTML = String(html`<div class="onboard"><h1>No se pudo abrir la base de datos</h1><p class="muted mt-s">${e.message}</p></div>`);
    return;
  }
  applyTheme();
  window.addEventListener('hashchange', () => render());
  // Si la app vuelve a primer plano en otro día, refrescar
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today() !== lastDay) { lastDay = today(); render(); }
  });
  window.addEventListener('fitcoach:theme', applyTheme);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render();
  // En desarrollo local no se usa caché offline (para ver los cambios al recargar); ?sw=1 la fuerza.
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw=1');
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW no registrado', e));
  }
}

boot();
