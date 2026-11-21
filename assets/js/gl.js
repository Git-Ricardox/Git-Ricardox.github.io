/* gl.js — shared WebGL helpers for holo.js and arm.js.
   - ONE three.js bundle per page (assets/vendor/three-site.min.js), imported once and shared.
   - WebGL probe runs once per page and releases its probe context right away
     (unreleased probe contexts pile up; Chrome then kills the oldest live context and,
     after repeated losses, blocks WebGL for the whole site).
   - release() frees a renderer's GPU context immediately instead of waiting for GC. */
let threeP = null, glOK = null;
export const three = () => (threeP ||= import(new URL('../vendor/three-site.min.js', import.meta.url).href));
export function hasWebGL() {
  if (glOK !== null) return glOK;
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    glOK = !!g;
    if (g) { const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
  } catch (e) { glOK = false; }
  return glOK;
}
export function release(renderer) {
  if (!renderer) return;
  try { renderer.dispose(); } catch (e) {}
  try { renderer.forceContextLoss(); } catch (e) {}
}
