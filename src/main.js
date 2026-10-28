import * as THREE from 'three';
import { buildCatalog, Post, clamp, smooth, win, lerp } from './lib.js';
import { makeScenes, T, measure, rrect, wrapText, setApp } from './scenes.js';

// Main timeline (seconds) — total 540 s = 9:00
export const SCENES = [
  ['hook', 30], ['patch', 55], ['hubble', 65], ['redshift', 45], ['webb', 40], ['miri', 60], ['exposure', 80], ['sources', 65], ['virgil', 45], ['dawn', 40], ['outro', 15],
];
// YouTube Short (portrait): scene, p-range, duration
export const SHORT = [['hook', 0, 0.6, 10], ['patch', 0, 0.5, 8], ['exposure', 0.1, 0.95, 22], ['sources', 0.3, 0.8, 10], ['dawn', 0.55, 1.0, 8]];

function resolve(mode, t) {
  if (mode === 'short') { let s = 0; for (const [id, a, b, d] of SHORT) { if (t < s + d || id === SHORT[SHORT.length - 1][0]) { const q = clamp((t - s) / d); return { id, p: lerp(a, b, q), local: t - s, start: s, dur: d, short: true }; } s += d; } }
  let s = 0; for (const [id, d] of SCENES) { if (t < s + d) return { id, p: (t - s) / d, local: t - s, start: s, dur: d }; s += d; }
  const [id, d] = SCENES[SCENES.length - 1]; return { id, p: 1, local: d, start: s - d, dur: d };
}
export const totalDuration = (mode) => mode === 'short' ? SHORT.reduce((a, s) => a + s[3], 0) : SCENES.reduce((a, s) => a + s[1], 0);

const app = { W: 1920, H: 1080, S: 1, aspect: 16 / 9, portrait: false, mode: 'main' };
let renderer, post, scenes, overlay, g, captions = [], built = new Set();

window.__init = async ({ w, h, mode, caps }) => {
  app.W = w; app.H = h; app.mode = mode; app.portrait = h > w; app.aspect = w / h; app.S = app.portrait ? w / 1080 : h / 1080; captions = caps || [];
  const canvas = document.getElementById('c'); canvas.width = w; canvas.height = h;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  app.renderer = renderer; setApp(app);
  await Promise.all(['400 20px InterB', '600 20px InterB', '800 20px InterB'].map((f) => document.fonts.load(f)));
  app.catalog = buildCatalog();
  post = new Post(renderer, w, h, 4); overlay = post.overCanvas; g = overlay.getContext('2d');
  scenes = makeScenes(app);
  return { ok: true, gl: renderer.getContext().getParameter(renderer.getContext().VERSION) };
};

function drawCaption(g, t) {
  const c = captions.find((x) => t >= x.start && t <= x.end + 0.25); if (!c) return;
  const W = app.W, H = app.H, s = app.S; const a = clamp((t - c.start) / 0.15) * (1 - clamp((t - c.end) / 0.25));
  const size = app.portrait ? 46 : 38; const lines = wrapText(g, c.text, W * (app.portrait ? 0.86 : 0.72), size, 600);
  const lh = size * 1.28 * s; const y0 = (app.portrait ? H * 0.74 : H * 0.905) - (lines.length - 1) * lh;
  const bw = Math.max(...lines.map((l) => measure(g, l, size, 600))) + 56 * s;
  g.save(); g.globalAlpha = a; rrect(g, W / 2 - bw / 2, y0 - size * s * 1.05, bw, lh * lines.length + 22 * s, 14 * s); g.fillStyle = 'rgba(2,5,14,.62)'; g.fill(); g.restore();
  lines.forEach((l, i) => T(g, l, W / 2, y0 + i * lh, { size, weight: 600, align: 'center', alpha: a, color: '#f4f8ff' }));
}

window.__frame = (t, opts = {}) => {
  const r = resolve(app.mode === 'short' ? 'short' : 'main', t);
  const id = opts.scene || r.id; const p = opts.p ?? r.p; const sc = scenes[id];
  if (!built.has(id)) { sc._build.call(sc); built.add(id); }
  const P = sc.update(p, app, t) || {}; P.time = t; P.S = app.S;
  // fade in from black at start, out at the end
  const total = totalDuration(app.mode); const edge = Math.max(clamp(1 - t / 0.6) * 1, clamp((t - (total - 0.8)) / 0.8)); if (!opts.scene) P.fade = Math.max(P.fade || 0, edge);
  if (id === 'outro' && p > 0.98) P.fade = Math.max(P.fade, smooth(0.98, 1, p));
  P.flash = P.flash || 0;
  g.clearRect(0, 0, app.W, app.H);
  if (opts.thumb) {
    const W = app.W, H = app.H, k = H / 720; g.fillStyle = 'rgba(0,0,10,.45)'; g.fillRect(0, 0, W * 0.62, H);
    T(g, '100 HOURS', 50 * k, 250 * k, { size: 150 * 1.0 / 1, weight: 800, glow: 30, glowColor: '#6fa8ff' });
    T(g, 'OF NOTHING?', 50 * k, 400 * k, { size: 150, weight: 800, color: '#ffd27a', glow: 30, glowColor: '#ff9a3a' });
    T(g, '2,500+ HIDDEN SOURCES', 54 * k, 480 * k, { size: 48, weight: 800, color: '#fff', sp: 2 });
    T(g, 'WEBB’S DEEPEST LOOK YET', 54 * k, 540 * k, { size: 34, weight: 600, color: '#9fc4ff', sp: 4 });
  }
  if (!opts.noHud) {
    sc.hud(g, p, t);
    if (!r.short && sc.title && r.local < 4.5 && !opts.scene) { const a = win(r.local, 0.3, 4.5, 0.5); T(g, sc.title, app.W * 0.04, app.H * 0.05, { size: 24, weight: 800, sp: 6, alpha: a * 0.9, color: '#9fc4ff' }); g.save(); g.globalAlpha = a; g.fillStyle = '#9fc4ff'; g.fillRect(app.W * 0.04, app.H * 0.05 + 14 * app.S, 70 * app.S, 3 * app.S); g.restore(); }
    drawCaption(g, t);
    T(g, 'TECHNICAL TALK INDIA', app.W - app.W * 0.03, app.portrait ? app.H * 0.035 : app.H * 0.05, { size: 18, weight: 700, align: 'right', sp: 5, alpha: 0.45 });
  }
  const [scene, camera] = sc.active;
  post.render(scene, camera, { bloom: 1, exposure: 1, expo: -1, mesh: false, thr: 0.9, vig: 0.45, grain: 0.02, gain: 4000, bg: 0.05, stretch: 40, mono: 0, ...P });
  return id;
};
window.__jpeg = (q = 0.95) => renderer.domElement.toDataURL('image/jpeg', q).split(',')[1];
window.__png = () => renderer.domElement.toDataURL('image/png').split(',')[1];
window.__meta = () => ({ main: totalDuration('main'), short: totalDuration('short'), scenes: SCENES, shortScenes: SHORT });
