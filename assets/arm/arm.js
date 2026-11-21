/* arm.js — 6-axis robot arm that fetches the selected project. ES module, no build step.
 *
 * Mounts into <div id="arm-stage"> (silently does nothing if the element is missing).
 * three.js + arm6.glb are loaded lazily, only when the stage becomes visible and only if
 * WebGL works and reduced motion is NOT requested; otherwise poster.jpg is shown, no 3D bytes.
 *
 * Listens to window "so:select" {detail:{slug,index,count}} and crossfades to clip pick_<index>.
 * While a pick clip runs, the newest selection is queued (one slot, latest wins) and starts
 * as soon as the arm is back at the shared HOME pose. Idle loops in between.
 * All motion (IK, timing, crate carrying) is baked in Blender; this file only plays clips.
 *
 * Emits window event "arm:clip" {detail:{clip}} whenever a clip starts (idle, pick_N).
 * Test hook: window.__arm = { select(i), ready: Promise<boolean>, mode }.
 */
const BASE = new URL('./', import.meta.url);
const GLB_URL = new URL('arm6.glb', BASE).href;
const POSTER_URL = new URL('poster.jpg', BASE).href;
const INDEX_URL = new URL('../../content/projects/index.json', BASE).href;

const SPEED = 2.0;        // pick clips play at 2x the baked Blender timing (5.2 s -> 2.6 s)
const FADE_IN = 0.15;     // idle -> pick
const FADE_CHAIN = 0.1;   // pick -> queued pick
const FADE_OUT = 0.2;     // pick -> idle
const MAX_DPR = 1.25;     // the stage is small; full retina costs 2-4x fill rate for little gain

import { three, hasWebGL, release } from '../js/gl.js';

function mount(stage) {
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });
  const api = { select() {}, ready, mode: 'init' };
  window.__arm = api;

  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
  if (!stage.clientHeight) stage.style.aspectRatio = '16 / 9';

  // ---- state shared by all modes
  let count = 6;
  let wanted = null;          // selection received before the arm is loaded
  let wantedCount = NaN;      // project count from so:select (else read from index.json)

  function onSelect(e) {
    const d = (e && e.detail) || {};
    if (Number.isFinite(d.count)) { wantedCount = d.count; setCount(d.count); }
    if (Number.isFinite(d.index)) api.select(d.index);
  }
  let setCount = (n) => { count = Math.max(0, Math.min(6, n | 0)); };
  window.addEventListener('so:select', onSelect);

  // ---- fallback: poster only
  function poster(reason) {
    if (stage.querySelector('.arm-poster')) return;
    const img = new Image();
    img.className = 'arm-poster';
    img.alt = '';
    img.decoding = 'async';
    img.src = POSTER_URL;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';
    stage.appendChild(img);
    stage.dataset.armState = 'poster';
    stage.dataset.armReason = reason;
    api.mode = 'poster';
    api.select = (i) => { stage.dataset.armIndex = String(i); };
    resolveReady(false);
  }

  if (reduced) return poster('reduced-motion');
  if (!hasWebGL()) return poster('no-webgl');

  stage.dataset.armState = 'idle-wait';
  api.mode = 'webgl';
  api.select = (i) => { wanted = i; };

  let started = false;
  let visible = false;
  let tickFn = null;          // set after load

  function onVisibility(v) {
    visible = v;
    if (v && !started) { started = true; load().catch((err) => { console.warn('[arm] fallback:', err); poster('error'); }); }
    if (tickFn) tickFn(visible && !document.hidden);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => onVisibility(es.some((e) => e.isIntersecting)), { rootMargin: '120px' }).observe(stage);
  } else {
    onVisibility(true);
  }
  document.addEventListener('visibilitychange', () => { if (tickFn) tickFn(visible && !document.hidden); });

  async function load() {
    stage.dataset.armState = 'loading';
    const [T, n] = await Promise.all([three(), fetch(INDEX_URL).then((r) => r.json()).then((j) => j.length).catch(() => 6)]);
    if (!Number.isFinite(wantedCount)) setCount(n);
    const gltf = await new T.GLTFLoader().loadAsync(GLB_URL);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.NoToneMapping;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .35s ease';
    stage.appendChild(canvas);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 50);

    // soft matte light rig (no emissive, no bloom)
    scene.add(new T.HemisphereLight(0xf4f7ff, 0x50648a, 3.4));
    const key = new T.DirectionalLight(0xfff1e2, 3.6);
    key.position.set(-1.7, 2.8, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const sc = key.shadow.camera;
    sc.left = -1.3; sc.right = 1.3; sc.top = 1.3; sc.bottom = -1.3; sc.near = 0.5; sc.far = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 5;
    scene.add(key);
    const fill = new T.DirectionalLight(0xcfe0ff, 1.6);
    fill.position.set(2.2, 1.2, 1.2);
    scene.add(fill);
    const rim = new T.DirectionalLight(0xffb27a, 1.6);
    rim.position.set(0.8, 2.0, -2.4);
    scene.add(rim);

    const ground = new T.Mesh(new T.PlaneGeometry(6, 6), new T.ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.071;
    ground.receiveShadow = true;
    scene.add(ground);

    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    scene.add(model);

    const crates = [];
    for (let i = 0; i < 6; i++) crates.push(model.getObjectByName('crate_' + i));
    setCount = (n) => {
      count = Math.max(0, Math.min(6, n | 0));
      crates.forEach((c, i) => { if (c) c.visible = i < count; });
    };
    setCount(count);

    // ---- camera: 3/4 front, fitted so plinth + arm reach fit any stage aspect
    const az = 14 * Math.PI / 180, el = 21 * Math.PI / 180;
    const dir = new T.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const center = new T.Vector3(0, 0.42, 0);
    const corners = [];   // plinth rim (r .92) + arm envelope (r .5 up to y 1.0)
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2;
      corners.push(new T.Vector3(0.62 * Math.cos(t), -0.07, 0.62 * Math.sin(t)));
      corners.push(new T.Vector3(0.42 * Math.cos(t), 0.95, 0.42 * Math.sin(t)));
    }
    let dprCap = MAX_DPR;
    function fit() {
      const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      let lo = 0.5, hi = 12;
      const p = new T.Vector3();
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        camera.position.copy(center).addScaledVector(dir, mid);
        camera.lookAt(center);
        camera.updateMatrixWorld();
        let ok = true;
        for (const c of corners) {
          p.copy(c).project(camera);
          if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.86) { ok = false; break; }
        }
        if (ok) hi = mid; else lo = mid;
      }
      camera.position.copy(center).addScaledVector(dir, hi);
      camera.lookAt(center);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(w, h, false);
    }
    fit();
    new ResizeObserver(fit).observe(stage);

    // ---- animation: only plays baked clips
    const mixer = new T.AnimationMixer(model);
    const act = {};
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name === 'idle') { a.setLoop(T.LoopRepeat, Infinity); a.timeScale = 1.5; }
      else { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = SPEED; }
      act[clip.name] = a;
    }
    let current = act.idle || null;
    let busy = null;            // running pick index
    let queued = null;
    if (current) current.play();

    function announce(name) { stage.dataset.armClip = name; window.dispatchEvent(new CustomEvent('arm:clip', { detail: { clip: name } })); }
    function go(next, fade) {
      next.reset().setEffectiveWeight(1).play();
      if (current && current !== next) current.crossFadeTo(next, fade, false);
      current = next;
    }
    function start(i) {
      const a = act['pick_' + i];
      if (!a) return;
      busy = i;
      go(a, current === act.idle ? FADE_IN : FADE_CHAIN);
      announce('pick_' + i);
    }
    mixer.addEventListener('finished', (e) => {
      if (busy === null || e.action !== act['pick_' + busy]) return;
      busy = null;
      if (queued !== null) { const n = queued; queued = null; start(n); }
      else if (act.idle) { go(act.idle, FADE_OUT); announce('idle'); }
    });

    api.select = (i) => {
      i = Math.max(0, Math.min(5, i | 0));
      if (!act['pick_' + i]) return;
      stage.dataset.armIndex = String(i);
      if (busy === null) start(i);
      else if (i !== busy) queued = i;
      else queued = null;
    };
    announce('idle');

    // ---- adaptive quality: slow machine (weak GPU / software GL) -> drop shadows, then resolution,
    //      then fall back to the poster so the page itself stays responsive
    let level = 0, nS = 0, slow = 0, prevRaf = 0;
    function tune(iv) {
      if (++nS < 20 || iv > 250) return;           // skip warm-up (shader compile) and tab/scroll hiccups
      slow = slow * 0.95 + (iv > 25 ? 0.05 : 0);   // page below ~40 fps for most of the last ~1 s
      if (slow < 0.6) return;
      slow = 0; nS = 0; level++;
      stage.dataset.armQuality = String(level);
      if (level === 1) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
      else if (level === 2) { dprCap = 0.75; fit(); }
      else { dead = true; tickFn(false); release(renderer); canvas.remove(); poster('too-slow'); }
    }

    // ---- render loop: exactly one rAF chain, parked while off-screen / tab hidden / detached
    let last = 0, raf = 0, on = false, dead = false;
    function frame(now) {
      raf = 0;
      if (!on || dead) return;
      if (prevRaf) tune(now - prevRaf); prevRaf = now;   // page frame interval = real cost incl. GPU + compositing
      if (now - last >= 32) {          // 30 fps cap: halves GPU/CPU load, motion still smooth at this size
        mixer.update(Math.min((now - last) / 1000, 0.1));
        last = now;
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);
    }
    tickFn = (v) => {
      on = v && stage.isConnected && !dead;
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
      prevRaf = 0;
    };
    // GPU trouble (driver reset, too many contexts): show the poster instead of a dead black box
    canvas.addEventListener('webglcontextlost', (e) => {
      if (dead) return;
      dead = true; tickFn(false); canvas.remove(); poster('context-lost');
    });
    // free the context on reload/leave right away (otherwise contexts pile up across reloads)
    addEventListener('pagehide', () => { dead = true; tickFn(false); release(renderer); }, { once: true });
    api.three = { renderer, scene, camera };   // test hook
    api.bench = (n = 60) => {   // test hook: median ms per rendered frame incl. GPU (gl.finish)
      const gl = renderer.getContext(), ts = [];
      const px = new Uint8Array(4); for (let k = 0; k < n; k++) { const t0 = performance.now(); mixer.update(1 / 60); renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
      ts.sort((x, y) => x - y); return +ts[n >> 1].toFixed(2);
    };
    mixer.update(0);
    renderer.render(scene, camera);
    canvas.style.opacity = '1';
    stage.dataset.armState = 'ready';
    tickFn(visible && !document.hidden);
    resolveReady(true);
    if (wanted !== null) { const w = wanted; wanted = null; api.select(w); }
  }
}

let mounted = false;
function init() {
  if (mounted) return;
  const stage = document.getElementById('arm-stage');
  if (!stage) return;           // nothing to do on pages without a stage (re-checked on pjax 'so:view')
  mounted = true;
  mount(stage);
}
addEventListener('so:view', init);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
