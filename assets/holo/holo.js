/* holo.js — hologram viewer for the CLI site (D21). ES module, no build step.
 * Mounts on every  <div data-holo data-glb="models/x.glb" data-poster="x.png" data-ascii="x.txt">.
 * Three.js (tree-shaken, vendored) is loaded lazily and ONLY if WebGL works and motion is allowed;
 * otherwise a PNG (+ ASCII silhouette) fallback is shown and no 3D bytes are fetched.
 * Keys (viewer focused, or page-wide with data-holo-keys="global"):
 *   ←/→ rotate 15° (Shift 45°) · +/− zoom · Space spin on/off · 0 reset.   See Keymap.md.
 * data-holo-keys="host": the host page (prototyp/app.js) owns the keys and publishes --yaw/--zoom on <html>,
 *   class "still" (spin off), "holo-off", "calm"; holo.js only follows those.
 * Options (data-*): data-holo-style="edges|wire"  data-holo-controls="off"  data-holo-spin="off"
 */
const SRC = new URL('.', import.meta.url);
const BUDGET = { tris: 60000, bytes: 400 * 1024 };
const FALLBACK_ASCII = `    .-------.
   /       /|
  .-------. |
  |       | '
  |       |/
  '-------'`;
const CSS = `
.holo{position:relative;min-height:16rem;height:16rem;overflow:hidden;touch-action:pan-y;cursor:grab;outline:none;user-select:none;
  background:radial-gradient(ellipse at 50% 60%,var(--glow,rgba(0,255,220,.2)),transparent 70%)}
.holo:focus-visible{outline:2px solid var(--focus,#a8d4ff);outline-offset:-2px}
.holo.drag{cursor:grabbing}
.holo canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.holo .holo-scan{position:absolute;inset:0;pointer-events:none;opacity:.3;background:repeating-linear-gradient(to bottom,transparent 0 3px,var(--glow,rgba(0,255,220,.2)) 3px 4px)}
.holo .holo-ctl{position:absolute;left:.4rem;bottom:.4rem;display:flex;gap:.25rem}
.holo .holo-ctl button,.holo-fb button{font:inherit;font-size:.8em;min-width:2.75rem;min-height:2.75rem;padding:0 .5rem;color:var(--accent,#5ff);background:var(--bg-sunken,#070d18);border:1px solid var(--border-strong,#5d7191);border-radius:2px;cursor:pointer}
.holo .holo-ctl button:hover,.holo-fb button:hover{border-color:var(--accent,#5ff)}
.holo .holo-ctl button:focus-visible,.holo-fb button:focus-visible{outline:2px solid var(--focus,#a8d4ff)}
.holo-fb{margin:0;display:grid;justify-items:center;align-content:center;gap:.4rem;min-height:15rem;text-align:center}
.holo-fb img{max-width:100%;max-height:13rem;height:auto;object-fit:contain}
.holo-fb pre{margin:0;color:var(--accent,#5ff);line-height:1.1;font-size:.9em;text-shadow:0 0 6px var(--glow,transparent)}
.holo-fb figcaption{color:var(--muted,#9fadc2);font-size:.75em}
.holo-gl .stage .rot,.holo-gl .stage .ring,.holo-gl .stage .scan{display:none}`;

let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }

export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');

let threeP;
const loadThree = () => (threeP ||= import('./vendor/three-holo.min.js'));

/* ---------- fallback: PNG -> ASCII -> built-in ASCII ---------- */
async function mountFallback(el, why, o) {
  injectCss();
  const fig = document.createElement('figure'); fig.className = 'holo-fb'; fig.setAttribute('role', 'img');
  fig.setAttribute('aria-label', el.dataset.holoLabel || 'Hologram (static fallback)');
  const pre = document.createElement('pre'); pre.setAttribute('aria-hidden', 'true');
  const showAscii = async () => {
    pre.textContent = FALLBACK_ASCII;
    if (el.dataset.ascii) try { const r = await fetch(new URL(el.dataset.ascii, document.baseURI)); if (r.ok) pre.textContent = (await r.text()).replace(/\s+$/, ''); } catch {}
    fig.prepend(pre);
  };
  if (el.dataset.poster) {
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    img.onerror = () => { img.remove(); showAscii(); };
    img.src = new URL(el.dataset.poster, document.baseURI).href; fig.append(img);
  } else await showAscii();
  const cap = document.createElement('figcaption');
  cap.textContent = { 'reduced-motion': 'static view (reduced motion)', 'no-webgl': 'static view (no WebGL)' }[why] || 'static view (model unavailable)';
  fig.append(cap);
  if (why === 'reduced-motion' && o.canGL) { // opt-in: user may still start the viewer, without auto-spin
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '[ 3D ]'; b.setAttribute('aria-label', 'Start 3D viewer without auto-rotation');
    b.onclick = () => { el.replaceChildren(); mountGL(el, { ...o, spin: false }); }; fig.append(b);
  }
  el.replaceChildren(fig); el.dataset.holoState = 'fallback-' + why;
  return { state: 'fallback-' + why, destroy() { fig.remove(); } };
}

/* ---------- WebGL viewer ---------- */
const VERT = `varying vec3 vN; varying vec3 vV; varying float vY;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vY = w.y; vN = normalize(mat3(modelMatrix)*normal);
  vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`;
const FRAG = `uniform vec3 cA; uniform vec3 cB; uniform float t; uniform float k;
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  float f = pow(1.-abs(dot(normalize(vN),normalize(vV))),2.2);
  float lines = step(.55,fract(vY*16.-t*.7));
  float sweep = smoothstep(.09,0.,abs(fract(vY*.45-t*.11)-.5)-.0);
  float flick = .93+.07*sin(t*41.+vY*5.);
  vec3 c = mix(cA,cB,clamp(vY*.5+.5,0.,1.));
  float a = (.07+f*.6+lines*.1+sweep*.4)*flick*k;
  gl_FragColor = vec4(c*(1.+sweep),a);
  #include <colorspace_fragment>
}`;

async function mountGL(el, o) {
  injectCss();
  const host = el.dataset.holoKeys === 'host';
  const root = document.documentElement;
  const T = await loadThree();
  const stage = host ? (el.querySelector('.stage') || el) : el;
  if (!host) { el.classList.add('holo'); el.tabIndex = 0; el.setAttribute('role', 'img'); el.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight + - Space'); el.setAttribute('aria-label', el.dataset.holoLabel || 'Interactive 3D hologram. Arrow keys rotate, plus and minus zoom, space stops rotation.'); }
  else root.classList.add('holo-gl');
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  if (host) canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; stage.prepend(canvas);

  const css = n => getComputedStyle(root).getPropertyValue(n).trim();
  const light = () => root.dataset.theme === 'light';
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(35, 1, .1, 50), pivot = new T.Group(), model = new T.Group();
  pivot.add(model); scene.add(pivot);
  const U = { cA: { value: new T.Color('#7db7f7') }, cB: { value: new T.Color('#97d68c') }, t: { value: 0 }, k: { value: 1 } };
  const mat = new T.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
  const lineMat = new T.LineBasicMaterial({ color: '#7db7f7', transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false });
  const ringMat = new T.LineBasicMaterial({ color: '#97d68c', transparent: true, opacity: .7, blending: T.AdditiveBlending, depthWrite: false });
  const theme = () => { // follow tokens.css (accent = lines, accent-2 = floor ring/tint); additive blend only works on dark
    const a = css('--accent') || '#5ff', b = css('--accent-2') || '#7f9';
    U.cA.value.set(a); U.cB.value.set(b); lineMat.color.set(a); ringMat.color.set(b);
    const bl = light() ? T.NormalBlending : T.AdditiveBlending; mat.blending = lineMat.blending = ringMat.blending = bl;
    U.k.value = light() ? 1.6 : 1; mat.needsUpdate = lineMat.needsUpdate = ringMat.needsUpdate = true; dirty = true;
  };

  const S = { yaw: 0, zoom: 1, spin: 0, still: o.spin === false, t: 0 };
  let dirty = true, vis = true, raf = 0, last = 0, frames = 0, acc = 0, dpr = Math.min(devicePixelRatio || 1, 1.5), alive = true;
  const stats = { fps: 0, tris: 0, bytes: 0, dpr };
  const inst = { state: 'gl', stats, S, el };

  // load model
  let gltf, bytes = 0;
  try {
    const r = await fetch(new URL(el.dataset.glb, document.baseURI)); if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = await r.arrayBuffer(); bytes = buf.byteLength;
    gltf = await new Promise((ok, no) => new T.GLTFLoader().parse(buf, '', ok, no));
  } catch (err) { console.warn('[holo] model failed:', err); canvas.remove(); renderer.dispose(); return mountFallback(el, 'error', { ...o, canGL: false }); }

  const style = el.dataset.holoStyle || 'edges';
  let tris = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(n => {
    if (!n.isMesh) return;
    const g = n.geometry; if (!g.attributes.normal) g.computeVertexNormals();
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    n.material = mat; n.renderOrder = 1;
    const e = new T.LineSegments(style === 'wire' ? new T.WireframeGeometry(g) : new T.EdgesGeometry(g, 22), lineMat); e.renderOrder = 2; n.add(e);
  });
  Object.assign(stats, { tris: Math.round(tris), bytes });
  if (tris > BUDGET.tris || bytes > BUDGET.bytes) console.warn(`[holo] over budget: ${Math.round(tris)} tris / ${(bytes / 1024).toFixed(0)} KB (limit ${BUDGET.tris} / ${BUDGET.bytes / 1024} KB)`);
  model.add(gltf.scene);
  const box = new T.Box3().setFromObject(model), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
  const sc = 1 / (Math.max(sz.x, sz.y, sz.z) * .5 || 1) * (el.dataset.holoScale ? +el.dataset.holoScale : .75);
  model.position.sub(c); pivot.scale.setScalar(sc);
  const floorY = -sz.y * .5 * sc - .08;
  const ring = new T.LineLoop(new T.BufferGeometry(), ringMat), pts = [];
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(Math.cos(a) * 1.35, floorY, Math.sin(a) * 1.35); }
  ring.geometry.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); scene.add(ring);
  // pivot scale baseline is sc; zoom multiplies it
  const base = sc;

  const resize = () => {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); cam.aspect = w / h;
    const dist = 5.4 * Math.max(1, 1 / cam.aspect * .9); cam.position.set(0, dist * .38, dist); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize(); theme();
  new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  addEventListener('calm', () => (dirty = true));

  const hostVar = n => parseFloat(root.style.getPropertyValue(n));
  const active = () => alive && vis && !document.hidden && !(host && root.classList.contains('holo-off'));
  const frame = now => {
    raf = 0; if (!alive) return;
    if (active()) {
      const dt = Math.min(.1, (now - last) / 1000 || 0); last = now;
      const still = host ? root.classList.contains('still') || root.classList.contains('calm') : S.still;
      if (host) { const y = hostVar('--yaw'), z = hostVar('--zoom'); if (y !== S.yaw || z !== S.zoom) { S.yaw = isNaN(y) ? 0 : y; S.zoom = isNaN(z) ? 1 : z; dirty = true; } }
      if (!still) { S.spin += dt * (360 / 22); S.t += dt; dirty = true; }
      if (dirty) {
        pivot.rotation.y = (S.yaw + S.spin) * Math.PI / 180; pivot.scale.setScalar(base * S.zoom); U.t.value = S.t;
        renderer.render(scene, cam); dirty = false;
        // adaptive resolution: if < 24 fps over ~1 s at DPR>1, drop to DPR 1
        frames++; acc += dt; if (acc >= 1) { stats.fps = Math.round(frames / acc); frames = 0; acc = 0; if (stats.fps < 24 && dpr > 1) { dpr = 1; stats.dpr = 1; resize(); } }
      } else last = now;
    } else last = now;
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis) kick(); }).observe(stage);
  document.addEventListener('visibilitychange', kick);

  // input
  const act = {
    left: s => (S.yaw -= s, dirty = true), right: s => (S.yaw += s, dirty = true),
    in: () => (S.zoom = Math.min(1.8, S.zoom + .15), dirty = true), out: () => (S.zoom = Math.max(.5, S.zoom - .15), dirty = true),
    toggle: () => { S.still = !S.still; dirty = true; }, reset: () => { S.yaw = 0; S.zoom = 1; dirty = true; }
  };
  if (!host) {
    const onKey = e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      const s = e.shiftKey ? 45 : 15; let h = true;
      switch (e.key) {
        case 'ArrowLeft': act.left(s); break; case 'ArrowRight': act.right(s); break;
        case '+': case '=': act.in(); break; case '-': case '_': act.out(); break;
        case ' ': if (e.target.closest('button,a')) return; act.toggle(); break; case '0': act.reset(); break;
        default: h = false;
      }
      if (h) { e.preventDefault(); kick(); }
    };
    (el.dataset.holoKeys === 'global' ? document : el).addEventListener('keydown', onKey);
    let x0 = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; el.classList.add('drag'); el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (x0 !== null) { S.yaw += (e.clientX - x0) * .6; x0 = e.clientX; dirty = true; kick(); } });
    const up = () => { x0 = null; el.classList.remove('drag'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    const sc2 = document.createElement('span'); sc2.className = 'holo-scan'; el.append(sc2);
    if (el.dataset.holoControls !== 'off') { // touch devices have no keyboard
      const bar = document.createElement('div'); bar.className = 'holo-ctl'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Hologram controls');
      [['←', 'Rotate left', () => act.left(15)], ['→', 'Rotate right', () => act.right(15)], ['−', 'Zoom out', act.out], ['+', 'Zoom in', act.in], ['❚❚', 'Spin on/off', act.toggle]]
        .forEach(([t, l, f]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', l); b.onclick = () => { f(); kick(); }; bar.append(b); });
      el.append(bar);
    }
  }
  inst.act = act; inst.kick = kick;
  inst.bench = n => { const gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now(); for (let i = 0; i < n; i++) { pivot.rotation.y += .05; renderer.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; }; // ms/frame incl. GPU sync
  inst.destroy = () => { alive = false; cancelAnimationFrame(raf); renderer.dispose(); canvas.remove(); };
  el.dataset.holoState = 'gl'; el.__holo = inst;
  el.dispatchEvent(new CustomEvent('holo:ready', { bubbles: true, detail: { tris: stats.tris, bytes } }));
  kick();
  return inst;
}

export async function mount(el) {
  if (el.__holo || el.dataset.holoState) return el.__holo;
  const o = { canGL: hasWebGL(), spin: el.dataset.holoSpin !== 'off' };
  if (!el.dataset.glb) return; // no model: leave host placeholder untouched
  if (reducedMotion()) return mountFallback(el, 'reduced-motion', o);
  if (!o.canGL) return mountFallback(el, 'no-webgl', o);
  el.dataset.holoState = 'loading';
  try { return await mountGL(el, o); } catch (err) { console.warn('[holo]', err); delete el.dataset.holoState; return mountFallback(el, 'error', { ...o, canGL: false }); }
}
export const mountAll = (root = document) => Promise.all([...root.querySelectorAll('[data-holo]')].map(mount));
if (!document.currentScript) (document.readyState === 'loading' ? addEventListener('DOMContentLoaded', () => mountAll()) : mountAll());
