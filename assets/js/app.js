/* simplyoverengineered — CLI site layer (D20, from prototype D18). Plain ES module, no deps, no build.
   Every page is a real static file (/en/…, /de/…). This script only adds: keys, command line, theme, hologram
   hand-off, and "pjax" navigation (fetch the next static page, swap <main>, pushState). No JS = normal links. */
const NAME = 'simplyoverengineered';
const ROOT = new URL('../../', import.meta.url);                       // site root (…/assets/js/app.js -> …/)
const HOLO = new URL('../holo/holo.js', import.meta.url);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement, main = $('#main'), inp = $('#in'), logEl = $('#log'), dlg = $('#dlg');
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const PAGES = ['about', 'projects', 'contact', 'files', 'legal', 'help'];
const CMDS = ['help', 'ls', 'cd', 'cat', 'open', 'about', 'projects', 'contact', 'files', 'legal', 'theme', 'lang', 'holo', 'motion', 'clear', 'back'];
let lastSlug = '', yaw = 25, zoom = 1, hist = [], hi = 0, swapT = 0, loadedPath = location.pathname;

/* ---------- location model: ROOT/<lang>/<route>/ ---------- */
const cur = () => {
  const [lang, ...rest] = location.pathname.slice(ROOT.pathname.length).replace(/\/+$/, '').split('/');
  return { lang: lang === 'de' ? 'de' : 'en', route: rest.join('/') };
};
const lang = () => cur().lang, route = () => cur().route;
const urlOf = (l, r) => new URL(`${l}/${r ? r + '/' : ''}`, ROOT);
const parent = r => r.replace(/\/?[^/]*$/, '');
const T = (en, de) => (lang() === 'en' ? en : de);

/* ---------- project index (content/projects/*.json is the source of truth) ---------- */
const slugsP = fetch(new URL('content/projects/index.json', ROOT)).then(r => r.json()).catch(() => []);
const projCache = {};
const project = s => (projCache[s] ||= fetch(new URL(`content/projects/${s}.json`, ROOT)).then(r => r.json()));
const valid = async () => ['', ...PAGES, ...(await slugsP).map(s => 'projects/' + s)];

/* ---------- output ---------- */
function say(txt, cls) {
  const d = document.createElement('div'); d.textContent = txt; if (cls) d.className = cls; logEl.appendChild(d);
  while (logEl.children.length > 8) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

/* ---------- theme / language ---------- */
function setTheme(v) {
  root.dataset.theme = v; store.set('tc-theme', v);
  $('#b-theme').innerHTML = `[theme: <b>${v}</b>]`;
}
function switchLang(l) { store.set('tc-lang', l); location.href = urlOf(l, route()); }   // different static tree -> full load

/* ---------- navigation (pjax over real static pages) ---------- */
async function nav(url, push = true) {
  url = new URL(url, location.href);
  try {
    const res = await fetch(url); if (!res.ok) throw new Error(res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html'), nm = doc.getElementById('main');
    if (!nm) throw new Error('no main');
    if (push) history.pushState(null, '', url);              // before the swap: relative URLs in the new markup resolve against it
    loadedPath = location.pathname;
    main.innerHTML = nm.innerHTML; main.dataset.route = nm.dataset.route;
    document.title = doc.title;
    enter();
  } catch (e) { location.href = url; }                       // anything odd: let the browser do a normal navigation
}
const go = r => nav(urlOf(lang(), r));
const list = () => $('[data-list]', main);
const back = () => (route() === '' ? say('already at ~', '') : go(parent(route())));

function enter() {                                           // runs after first load and after every swap
  const { lang: l, route: r } = cur();
  root.lang = l;
  $('#cwd').textContent = '~' + (r ? '/' + r : '');
  $('.ps1', $('.bar')).href = urlOf(l, '');
  $('#b-lang').href = urlOf(l === 'en' ? 'de' : 'en', r);
  $('#b-help').href = urlOf(l, 'help');
  inp.placeholder = T('type help …', 'tippe help …');
  main.scrollTop = 0;
  $$('[data-holo]', main).forEach(s => { if (!$('.stage', s)) s.appendChild($('#t-holo').content.cloneNode(true)); });
  const v = $('#v-project', main); if (v) holoVars(v);
  const l2 = list(), keep = document.activeElement === inp;  // command line keeps focus while you chain commands
  const pl = $('#plist', main);
  if (r.startsWith('projects/')) lastSlug = r.split('/')[1];          // Esc returns to the project you came from
  if (pl && lastSlug) { const i = $$('li', pl).findIndex(li => li.dataset.slug === lastSlug); if (i >= 0) pl.dataset.i = i; }
  if (pl) preview($$('li', pl)[+pl.dataset.i || 0], true);
  if (!keep) { if (l2) focusItem(l2, +l2.dataset.i || 0); else main.focus({ preventScroll: true }); }
  if ($('[data-holo]', main)) import(HOLO).then(m => m.mountAll(main));
}

/* ---------- lists & hologram ---------- */
function focusItem(l, i, items = $$('a', l)) {
  if (!items.length) return;
  i = (i + items.length) % items.length; l.dataset.i = i; items[i].focus({ preventScroll: false });
}
function holoVars(el) { $$('.cube').forEach(c => ['w', 'h', 'd'].forEach(k => c.style.setProperty('--' + k, el ? el.dataset[k] : 60))); }
function preview(li, first) {
  if (!li) return;
  holoVars(li); $('#pv-name').textContent = '· ' + $('.nm', li).textContent; $('#pv-sum').textContent = $('.sum', li).textContent;
  const slot = $('[data-holo]', main);
  if (slot && li.dataset.glb && slot.dataset.glb !== li.dataset.glb) {
    clearTimeout(swapT);
    swapT = setTimeout(async () => {                         // debounce: holding ↓ must not reload a model per key repeat
      const m = await import(HOLO);
      slot.__holo && slot.__holo.destroy && slot.__holo.destroy();
      delete slot.__holo; delete slot.dataset.holoState;
      Object.assign(slot.dataset, { glb: li.dataset.glb, poster: li.dataset.poster, ascii: li.dataset.ascii });
      slot.replaceChildren($('#t-holo').content.cloneNode(true)); holoVars(li);
      m.mount(slot);
    }, first ? 0 : 160);
  }
}
addEventListener('focusin', e => {
  const a = e.target.closest && e.target.closest('#plist a'); if (a) { const l = a.closest('[data-list]'); l.dataset.i = $$('a', l).indexOf(a); preview(a.closest('li')); }
});
const zoomYaw = () => { root.style.setProperty('--yaw', yaw); root.style.setProperty('--zoom', zoom); };
const rotate = d => { yaw += d; zoomYaw(); };
const holoView = () => !!$('[data-holo]', main);
(() => { // drag-to-orbit
  let x0 = null;
  document.addEventListener('pointerdown', e => { if (e.target.closest('.stage')) x0 = e.clientX; });
  addEventListener('pointermove', e => { if (x0 !== null) { yaw += (e.clientX - x0) * .6; x0 = e.clientX; zoomYaw(); } });
  addEventListener('pointerup', () => (x0 = null));
})();

/* ---------- keys ---------- */
function act(k, e = { target: document.body, shiftKey: false, preventDefault() {} }) {
  const l = list(), items = l ? $$('a', l) : [], i = l ? +l.dataset.i || 0 : 0, step = e.shiftKey ? 45 : 15;
  switch (k) {
    case '/': case ':': inp.focus(); e.preventDefault(); return;
    case '?': openDlg(); e.preventDefault(); return;
    case 't': setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); return;
    case 'g': switchLang(lang() === 'en' ? 'de' : 'en'); return;
    case 'ArrowDown': case 'j': e.preventDefault(); l ? focusItem(l, i + 1, items) : main.scrollBy({ top: 56 }); return;
    case 'ArrowUp': case 'k': e.preventDefault(); l ? focusItem(l, i - 1, items) : main.scrollBy({ top: -56 }); return;
    case 'Home': if (l) { e.preventDefault(); focusItem(l, 0, items); } return;
    case 'End': if (l) { e.preventDefault(); focusItem(l, -1, items); } return;
    case 'ArrowLeft': case 'h': if (holoView()) rotate(-step); else if (k === 'h') back(); return;
    case 'ArrowRight': case 'l': if (holoView()) rotate(step); else if (k === 'l' && items[i]) items[i].click(); return;
    case '+': case '=': zoom = Math.min(1.8, zoom + .15); zoomYaw(); return;
    case '-': case '_': zoom = Math.max(.5, zoom - .15); zoomYaw(); return;
    case ' ': if (holoView() && !e.target.closest('button,a')) { e.preventDefault(); root.classList.toggle('still'); } return;
    case 'Enter': if (items[i] && !e.target.closest('a,button')) items[i].click(); return;
    case 'Escape': case 'Backspace': back(); return;
  }
  if (/^[1-9]$/.test(k) && items[+k - 1]) focusItem(l, +k - 1, items);
}
document.addEventListener('keydown', e => {
  if (!e.target.closest) return;
  if (e.ctrlKey || e.metaKey || e.altKey || dlg.open) return;
  if (e.target === inp) {
    if (e.key === 'Escape') { inp.blur(); enter(); }
    else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); hi = Math.max(0, hi - 1); inp.value = hist[hi]; }
    else if (e.key === 'ArrowDown' && hist.length) { e.preventDefault(); hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ''; }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    return;
  }
  if (e.key === 'Enter' && e.target.closest('a,button')) return;     // native activation
  if (e.key === 'Backspace' && e.target.closest('a,button')) e.preventDefault();
  act(e.key, e);
});
$$('.pad [data-k]').forEach(b => b.addEventListener('click', () => act(b.dataset.k)));
$('#b-theme').onclick = () => act('t');

/* ---------- link handling: same-site page links -> pjax; help link -> dialog ---------- */
document.addEventListener('click', e => {
  const yt = e.target.closest('[data-yt]');
  if (yt) {                                                  // YouTube only after the click (privacy mode)
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.dataset.yt)}?autoplay=1&rel=0`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = 'YouTube'; f.className = 'ph video';
    f.style.border = '0'; yt.replaceWith(f); return;
  }
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download') || a.hasAttribute('hreflang')) return;
  if (a.id === 'b-help') { e.preventDefault(); openDlg(); return; }
  const u = new URL(a.href);
  if (u.origin !== location.origin || !u.pathname.startsWith(ROOT.pathname) || u.pathname === location.pathname) return;
  if (!/^\/?(en|de)(\/|$)/.test(u.pathname.slice(ROOT.pathname.length))) return;    // assets, content, … -> normal load
  e.preventDefault(); nav(u);
});
addEventListener('popstate', () => { if (location.pathname !== loadedPath) nav(location.href, false); });

/* ---------- help overlay (native <dialog>: focus trap + Esc for free) ---------- */
const openDlg = () => dlg.showModal();
$('#dlg-x').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { const l = list(); l ? focusItem(l, +l.dataset.i || 0) : main.focus({ preventScroll: true }); });

/* ---------- command line ---------- */
function resolve(p) {
  let parts = route() === '' ? [] : route().split('/');
  if (p.startsWith('/') || p.startsWith('~')) parts = [];
  p.replace(/^[~/]+/, '').split('/').forEach(s => { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); });
  return parts.join('/');
}
const here = async () => (route() === '' ? PAGES : route() === 'projects' ? await slugsP : []);
const C = {
  help: () => go('help'), about: () => go('about'), projects: () => go('projects'), contact: () => go('contact'), files: () => go('files'), legal: () => go('legal'),
  ls: async () => say((await here()).join('  ') || '(empty)'),
  back: () => back(),
  cd: async a => { const r = resolve(a || '/'); (await valid()).includes(r) ? go(r) : say(`cd: no such directory: ${a}`, 'err'); },
  cat: async a => {
    if (!a) return say('cat: missing file', 'err');
    let r = resolve(a); const sum = /\/summary$/.test(r); if (sum) r = parent(r);
    if (!(await valid()).includes(r)) return say(`cat: ${a}: no such file`, 'err');
    if (sum && r.startsWith('projects/')) { const p = await project(r.split('/')[1]); return say(p['kurz_' + lang()]); }
    go(r);
  },
  open: async a => ((await slugsP).includes(a) ? go('projects/' + a) : say(`open: ${a || '?'}: unknown project (try ls in projects)`, 'err')),
  theme: a => (['dark', 'light'].includes(a) ? (setTheme(a), say('theme → ' + a, 'ok')) : say('usage: theme dark|light', 'err')),
  lang: a => (['en', 'de'].includes(a) ? (a === lang() ? say('lang → ' + a, 'ok') : switchLang(a)) : say('usage: lang en|de', 'err')),
  holo: a => (['on', 'off'].includes(a) ? (root.classList.toggle('holo-off', a === 'off'), say('holo → ' + a, 'ok')) : say('usage: holo on|off', 'err')),
  motion: a => (['on', 'off'].includes(a) ? (root.classList.toggle('calm', a === 'off'), dispatchEvent(new Event('calm')), say('motion → ' + a, 'ok')) : say('usage: motion on|off', 'err')),
  clear: () => (logEl.innerHTML = '')
};
$('#cmd').addEventListener('submit', e => {
  e.preventDefault();
  const line = inp.value.trim(); inp.value = ''; if (!line) { inp.blur(); enter(); return; }
  hist.push(line); hi = hist.length; say(`$ ${line}`, 'cmd');
  const [c, ...rest] = line.split(/\s+/), fn = C[c.toLowerCase()];
  fn ? fn(rest.join(' ')) : say(`${c}: command not found — try help`, 'err');
});
async function complete() {
  const [c, ...rest] = inp.value.split(/\s+/), arg = rest.length > 0, h = await here(), s = await slugsP;
  const pool = !arg ? CMDS : { cd: h, cat: [...h, ...(route() === '' ? ['projects'] : [])], open: s, theme: ['dark', 'light'], lang: ['en', 'de'], holo: ['on', 'off'], motion: ['on', 'off'] }[c] || [];
  const word = arg ? rest[rest.length - 1] : c, m = pool.filter(x => x.startsWith(word));
  if (!m.length) return;
  let p = m[0]; for (const x of m) while (!x.startsWith(p)) p = p.slice(0, -1);
  inp.value = (arg ? c + ' ' : '') + p + (m.length === 1 ? ' ' : '');
  if (m.length > 1) say(m.join('  '));
}

/* ---------- init ---------- */
setTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
zoomYaw(); holoVars(null);
enter();
