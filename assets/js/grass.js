/* ASCII grass + pollen footer. Grows once on load, sways at ~3 fps, stops for prefers-reduced-motion / `motion off` / hidden tab. */
(() => {
  const pre = document.getElementById('grass'); if (!pre) return;
  const root = document.documentElement, mq = matchMedia('(prefers-reduced-motion: reduce)');
  const R = 4, calm = () => mq.matches || root.classList.contains('calm');
  let cols = 0, h = [], fl = [], pol = [], t = 0, grown = 0, timer = 0;
  const rnd = n => Math.random() * n | 0;

  function build() {
    const probe = document.createElement('span'); probe.textContent = 'M'.repeat(20); pre.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 20 || 8; pre.removeChild(probe);
    cols = Math.max(10, Math.floor(pre.clientWidth / cw));
    h = Array.from({ length: cols }, () => (Math.random() < .12 ? 0 : 1 + rnd(3)));
    fl = h.map(v => v > 1 && Math.random() < .07);
    pol = Array.from({ length: Math.ceil(cols / 14) }, () => ({ x: rnd(cols), y: Math.random() * R, v: .6 + Math.random() * .8 }));
    grown = calm() ? cols : 0;
  }

  function draw() {
    const g = Array.from({ length: R }, () => Array(cols).fill(' '));
    for (let x = 0; x < Math.min(grown, cols); x++) {
      const s = Math.sin(t * .5 + x * .35), tip = s > .35 ? '/' : s < -.35 ? '\\' : '|';
      for (let k = 0; k < h[x]; k++) g[R - 1 - k][x] = k === h[x] - 1 ? (fl[x] ? '*' : (h[x] > 1 ? tip : ',')) : '|';
    }
    pol.forEach(p => { const r = Math.floor(p.y) % R, c = Math.floor(p.x) % cols; if (g[r][c] === ' ') g[r][c] = '.'; });
    pre.innerHTML = g.map(r => r.join('').replace(/\*/g, '<i>*</i>').replace(/\./g, '<b>·</b>')).join('\n');
  }

  function tick() {
    t += .5; grown += cols / 8;
    pol.forEach(p => { p.y -= .12 * p.v; p.x += Math.sin(t + p.v * 9) * .4; if (p.y < 0) { p.y = R - .01; p.x = rnd(cols); } if (p.x < 0) p.x += cols; });
    draw();
  }
  function start() {
    clearInterval(timer); build(); draw();
    if (!calm() && !document.hidden) timer = setInterval(tick, 330);
  }
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(start, 200); });
  document.addEventListener('visibilitychange', start); mq.addEventListener('change', start); addEventListener('calm', start);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start); start();
})();
