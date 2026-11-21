/* plants.js — the living greenhouse: edge vines, planter bed, a few drifting spores.
   Pure inline SVG + CSS (transform/opacity only). No WebGL, no requestAnimationFrame loop, no timers.
   Everything that moves carries class `plant`; an IntersectionObserver adds `.off` (animation-play-state: paused)
   when it is off-screen, and the tab being hidden pauses all of it. `.calm` / prefers-reduced-motion = static, fully grown.
   Vines grow once per browser session (sessionStorage), later loads show them already grown. */
const root = document.documentElement, term = document.getElementById('term');
const NS = 'http://www.w3.org/2000/svg';
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const svg = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const r1 = n => Math.round(n * 10) / 10;
let grown = false; try { grown = sessionStorage.getItem('so-grown') === '1'; } catch (e) {}

/* ---------- pause / resume ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('off', !e.isIntersecting))) : null;
const watch = () => io && document.querySelectorAll('.plant').forEach(n => { if (!n.__w) { n.__w = 1; io.observe(n); } });
document.addEventListener('visibilitychange', () => root.classList.toggle('bgpause', document.hidden));

/* ---------- vines along both edges of the terminal frame ---------- */
function buildVines(grow) {
  term.querySelectorAll(':scope > .vines').forEach(v => v.remove());
  const H = term.clientHeight; if (H < 200) return;
  ['l', 'r'].forEach((side, si) => {
    const box = document.createElement('div'); box.className = `vines ${side} plant${grow ? ' grow' : ''}`; box.setAttribute('aria-hidden', 'true');
    term.appendChild(box);
    const W = box.clientWidth || 34, wide = W >= 30, cx = wide ? W / 2 : 4, amp = wide ? 4 : 2.2, Lmax = wide ? 11 : 7;
    const rnd = rng(7 + si * 31), ph = rnd() * 6;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, box);
    const pts = []; for (let y = H + 6; y > -8; y -= 34) pts.push([r1(cx + amp * Math.sin(y / 55 + ph)), y]);
    let d = `M${pts[0]} `;
    for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; d += `Q${pts[i]} ${r1(m[0])} ${r1(m[1])} `; }
    svg('path', { d: d + `L${pts[pts.length - 1]}`, class: 'vp', pathLength: 1 }, s);
    pts.forEach(([x, y], i) => {
      if (i < 1 || i > pts.length - 2) return;
      const delay = Math.round(((H - y) / H) * 2200 + 250 + rnd() * 160);
      const side_ = i % 2 ? 1 : -1, a = side_ > 0 ? -(34 + rnd() * 30) : -(118 + rnd() * 28);
      const L = r1(Lmax * (.62 + rnd() * .38) * (side_ > 0 ? 1 : .9)), w = r1(L * .42);
      const g = svg('g', { transform: `translate(${x} ${y}) rotate(${r1(a)})` }, s);
      svg('path', { d: `M0 0Q${r1(L / 2)} ${-w} ${L} 0Q${r1(L / 2)} ${w} 0 0Z`, class: `vl ${i % 3 ? 'a' : 'b'}`, style: `animation-delay:${delay}ms` }, g);
      if (i % 9 === 4) {                                                   // a little sun-orange blossom
        const f = svg('g', { transform: `translate(${x} ${y})`, class: 'vf', style: `animation-delay:${delay + 260}ms` }, s), k = wide ? 1 : .8;
        for (let p = 0; p < 5; p++) { const t = p * 1.2566; svg('circle', { cx: r1(Math.cos(t) * 2.7 * k), cy: r1(Math.sin(t) * 2.7 * k), r: r1(1.9 * k), class: 'fb' }, f); }
        svg('circle', { cx: 0, cy: 0, r: r1(1.4 * k), class: 'fc' }, f);
      }
    });
  });
}

/* ---------- planter bed in the footer: three layers of grass, flowers, each layer sways as one composited element ---------- */
function buildBed() {
  const bed = document.getElementById('bed'); if (!bed) return;
  bed.replaceChildren(); const W = bed.clientWidth; if (!W) return;
  const rnd = rng(99), BH = 46;
  [{ h: 34, step: 15, c: 'g0' }, { h: 27, step: 13, c: 'g1' }, { h: 19, step: 11, c: 'g2' }].forEach((L, li) => {
    const s = svg('svg', { viewBox: `0 0 ${W} ${BH}`, class: `tuft t${li} plant` }, bed);
    let d = '', fl = '';
    for (let x = rnd() * 8; x < W; x += L.step * (.6 + rnd() * .9)) {
      const n = 3 + (rnd() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const b = x + (k - n / 2) * 2.4, h = L.h * (.5 + rnd() * .5), ln = (rnd() - .5) * 10 + (k - n / 2) * 2.4;
        d += `M${r1(b - 1.7)} ${BH}Q${r1(b + ln * .3)} ${r1(BH - h * .6)} ${r1(b + ln)} ${r1(BH - h)}Q${r1(b + ln * .3 + 1.7)} ${r1(BH - h * .55)} ${r1(b + 1.7)} ${BH}Z`;
      }
      if (li > 0 && rnd() < (li === 1 ? .12 : .1)) {                       // a flower on a stalk
        const h = L.h + 6 + rnd() * 8, cl = ['fb', 'fc', 'fp'][rnd() * 3 | 0];
        fl += `<path class="fs" d="M${r1(x)} ${BH}Q${r1(x + 2)} ${r1(BH - h / 2)} ${r1(x)} ${r1(BH - h)}"/><circle class="${cl}" cx="${r1(x)}" cy="${r1(BH - h)}" r="${r1(2.6 + rnd())}"/><circle class="fc2" cx="${r1(x)}" cy="${r1(BH - h)}" r="1"/>`;
      }
    }
    s.innerHTML = `<path class="${L.c}" d="${d}"/>${fl}`;
  });
}

/* ---------- a few spores / pollen motes (8 elements, transform + opacity only) ---------- */
function buildPollen() {
  if (term.querySelector(':scope > .pollen')) return;
  const p = document.createElement('div'); p.className = 'pollen plant'; p.setAttribute('aria-hidden', 'true');
  const rnd = rng(5);
  for (let i = 0; i < 8; i++) {
    const m = document.createElement('i');
    m.style.cssText = `left:${r1(6 + rnd() * 88)}%;bottom:${r1(4 + rnd() * 30)}%;--t:${r1(17 + rnd() * 14)}s;--dl:-${r1(rnd() * 20)}s;--dx:${r1((rnd() - .3) * 90)}px;`;
    p.appendChild(m);
  }
  term.insertBefore(p, term.firstChild);
}

function build(grow) { buildVines(grow); buildBed(); buildPollen(); watch(); }
if (term) {
  const calm = root.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  build(!grown && !calm);
  try { sessionStorage.setItem('so-grown', '1'); } catch (e) {}
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => build(false), 220); });
  addEventListener('so:view', watch);                                      // plants inside a swapped <main> (home hero) join the observer
}
