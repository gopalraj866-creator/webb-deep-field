import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, smooth, easeOut, easeInOut, win, fmt, GalaxyField, makeStars, makeSpikeStars, DIST, cosmicAge } from './lib.js';
import { buildWebb, buildHubble, buildMoon, buildEarth } from './models.js';

// ================= HUD helpers =================
const FONT = 'InterB, Inter, "DejaVu Sans", Arial, sans-serif';
let A = null; // app (set per frame)
const S = () => A.S;
function T(g, s, x, y, o = {}) {
  const { size = 32, weight = 600, color = '#fff', align = 'left', alpha = 1, sp = 0, base = 'alphabetic', glow = 0 } = o;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size * S()}px ${FONT}`; g.textAlign = align; g.textBaseline = base; g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = `${sp * S()}px`;
  if (glow) { g.shadowColor = o.glowColor || color; g.shadowBlur = glow * S(); }
  g.fillText(s, x, y); g.restore();
}
function measure(g, s, size, weight = 600, sp = 0) { g.save(); g.font = `${weight} ${size * S()}px ${FONT}`; if ('letterSpacing' in g) g.letterSpacing = `${sp * S()}px`; const w = g.measureText(s).width; g.restore(); return w; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function panel(g, x, y, w, h, a = 0.5, line = 'rgba(160,200,255,.35)') { g.save(); rrect(g, x, y, w, h, 10 * S()); g.fillStyle = `rgba(4,8,18,${a})`; g.fill(); g.lineWidth = 1.5 * S(); g.strokeStyle = line; g.stroke(); g.restore(); }
function bracket(g, x, y, w, h, len, col, lw = 2) { g.save(); g.strokeStyle = col; g.lineWidth = lw * S(); g.beginPath();
  g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y); g.moveTo(x + w - len, y); g.lineTo(x + w, y); g.lineTo(x + w, y + len);
  g.moveTo(x + w, y + h - len); g.lineTo(x + w, y + h); g.lineTo(x + w - len, y + h); g.moveTo(x + len, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - len); g.stroke(); g.restore(); }
function wrapText(g, s, maxW, size, weight) { const words = s.split(' '); const lines = []; let cur = ''; words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (measure(g, t, size, weight) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
function bigTitle(g, s, p, a, b, y, size = 120, color = '#fff', sub = null) {
  const v = win(p, a, b, (b - a) * 0.18); if (v < 0.01) return; const W = A.W, H = A.H;
  const sz = A.portrait ? size * 0.62 : size; const lines = A.portrait ? wrapText(g, s, W * 0.86, sz, 800) : [s];
  lines.forEach((ln, i) => T(g, ln, W / 2, H * y + i * sz * 1.08 * S(), { size: sz, weight: 800, align: 'center', alpha: v, color, sp: 2, glow: 30, glowColor: 'rgba(120,170,255,.8)' }));
  if (sub) T(g, sub, W / 2, H * y + (lines.length * sz * 1.08 + 26) * S(), { size: 34 * (A.portrait ? 0.8 : 1), weight: 600, align: 'center', alpha: v * 0.85, color: '#9fc4ff', sp: 4 });
}
const W2 = (A_) => A_.portrait ? 0.9 : 0.5;

// ================= shared plane (deep-field) scene =================
function plane(app) {
  if (app._plane) return app._plane;
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(30, app.aspect, 0.1, 100);
  const field = new GalaxyField(app.catalog); scene.add(field.mesh);
  const spikes = []; const r = (i) => Math.abs(Math.sin(i * 91.7 + 3.1)) % 1;
  for (let i = 0; i < 9; i++) spikes.push({ p: [(r(i) * 2 - 1) * 1.7, (r(i + 40) * 2 - 1) * 0.95, 0.01], size: 0.1 + r(i + 7) * 0.12, br: 0.6 + r(i + 13) * 0.9 });
  const sp = makeSpikeStars(spikes); scene.add(sp);
  app._plane = { scene, camera, field, sp };
  return app._plane;
}
function setPlaneCam(pl, app, cx, cy, viewH) {
  const z = (viewH / 2) / Math.tan(THREE.MathUtils.degToRad(pl.camera.fov / 2));
  pl.camera.aspect = app.aspect; pl.camera.updateProjectionMatrix(); pl.camera.position.set(cx, cy, z); pl.camera.lookAt(cx, cy, 0);
  pl.camera.updateMatrixWorld(); pl.viewH = viewH;
}
function proj(cam, app, x, y, z = 0) { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * app.W, (1 - (v.y * 0.5 + 0.5)) * app.H]; }
const base = (o = {}) => ({ bloom: 1, exposure: 1, expo: -1, mesh: false, thr: 0.9, vig: 0.45, grain: 0.02, gain: 4000, bg: 0.05, stretch: 40, mono: 0, ...o });

export function makeScenes(app) {
  const sc = {};

  // ---------------- HOOK ----------------
  sc.hook = {
    title: null,
    build() {
      this.sA = new THREE.Scene(); this.cA = new THREE.PerspectiveCamera(55, app.aspect, 0.1, 2000);
      const dir = new THREE.Vector3(0, 0, -1);
      this.stars = makeStars(5000, 600, 5, { dir, ang: 0.016 }); this.sA.add(this.stars);
      const list = []; for (let i = 0; i < 16; i++) { const a = i * 2.399, b = Math.acos(1 - 2 * ((i * 0.618) % 1)); const v = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)).multiplyScalar(560); if (v.z < -300 && Math.hypot(v.x, v.y) < 90) v.x += 160; list.push({ p: v.toArray(), size: 26 + (i % 5) * 9, br: 0.7 + (i % 3) * 0.4 }); }
      this.spk = makeSpikeStars(list); this.sA.add(this.spk);
      this.sB = new THREE.Scene(); this.cB = new THREE.PerspectiveCamera(62, app.aspect, 0.05, 1000);
      this.field = new GalaxyField(app.catalog, { cone: true }); this.sB.add(this.field.mesh);
    },
    update(p) {
      const U = this.field.uniforms; U.uRedden.value = 1; U.uBright.value = 1.5; U.uSizeMul.value = 1; U.uNear.value = 1;
      this.stars.material.uniforms.uPx.value = app.S * 1.2;
      let flash = 0; const e = easeInOut;
      if (p < 0.5) {
        this.active = [this.sA, this.cA]; const q = clamp(p / 0.5);
        this.cA.aspect = app.aspect; this.cA.fov = lerp(60, 30, easeInOut(q)); this.cA.updateProjectionMatrix();
        this.cA.position.set(0, 0, -300 * Math.pow(q, 2.2)); this.cA.lookAt(0, 0, -1000);
        flash = smooth(0.44, 0.5, p);
      } else {
        this.active = [this.sB, this.cB]; const q = clamp((p - 0.5) / 0.5);
        this.cB.aspect = app.aspect; this.cB.updateProjectionMatrix();
        this.cB.position.set(Math.sin(q * 2.0) * 3, Math.cos(q * 1.6) * 1.5, -150 * e(q)); this.cB.lookAt(0, 0, -400);
        flash = 1 - smooth(0.5, 0.56, p);
      }
      return base({ flash: flash * 0.95, mesh: false, bloom: 1.2 });
    },
    hud(g, p) {
      const W = app.W, H = app.H;
      bigTitle(g, '100 HOURS', p, 0.03, 0.17, 0.5, 150);
      bigTitle(g, 'ONE EMPTY PATCH OF SKY', p, 0.18, 0.31, 0.5, 96);
      bigTitle(g, 'NOTHING TO SEE…', p, 0.32, 0.45, 0.5, 96, '#9fc4ff');
      if (p < 0.5) { const q = clamp(p / 0.5); const s = lerp(0.02, 0.42, Math.pow(q, 2.6)) * Math.min(W, H); const v = smooth(0.12, 0.3, p);
        bracket(g, W / 2 - s / 2, H / 2 - s / 2, s, s, s * 0.22, `rgba(150,200,255,${0.9 * v})`, 3); T(g, 'TARGET FIELD', W / 2, H / 2 + s / 2 + 44 * S(), { size: 24, align: 'center', alpha: v * 0.9, sp: 6, color: '#9fc4ff' }); }
      const n = Math.floor(2500 * easeOut(smooth(0.58, 0.74, p)));
      const v = win(p, 0.56, 0.74, 0.04);
      if (v > 0.01) { T(g, fmt(n) + '+', W / 2, H * 0.5, { size: A.portrait ? 120 : 190, weight: 800, align: 'center', alpha: v, glow: 36, glowColor: '#7fb2ff' }); T(g, 'SOURCES IN THE DARK', W / 2, H * 0.5 + 70 * S(), { size: 34, align: 'center', alpha: v, sp: 8, color: '#9fc4ff' }); }
      bigTitle(g, 'WEBB’S DEEPEST LOOK YET', p, 0.77, 1.01, 0.5, 110, '#fff', '100 HOURS STARING INTO NOTHING');
    },
  };

  // ---------------- PATCH ----------------
  sc.patch = {
    title: '01 · THE EMPTY PATCH',
    build() {
      this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(40, app.aspect, 0.01, 1000);
      this.moon = buildMoon(); this.moon.position.set(0, 0, -10); this.s.add(this.moon);
      this.stars = makeStars(3000, 300, 9); this.s.add(this.stars);
    },
    update(p) {
      this.active = [this.s, this.c]; this.stars.material.uniforms.uPx.value = app.S * 1.2;
      const q = easeInOut(smooth(0.3, 0.64, p)); const sx = lerp(1.5, 3.2, q), sz = lerp(3.2, -9.72, q);
      this.c.aspect = app.aspect; this.c.updateProjectionMatrix(); this.c.position.set(sx, 0, sz); this.c.lookAt(sx, 0, -10); this.c.updateMatrixWorld();
      return base({ bloom: 0.7, mesh: true, exposure: 1.0 });
    },
    hud(g, p) {
      const W = app.W, H = app.H; const c = this.c;
      const [cx, cy] = proj(c, app, 3.2, 0, -10); const [ex] = proj(c, app, 3.3, 0, -10); const half = Math.max(Math.abs(ex - cx), 14 * S());
      const vis = 1;
      bracket(g, cx - half, cy - half, half * 2, half * 2, half * 0.5, 'rgba(120,220,255,.95)', 3);
      const a1 = win(p, 0.02, 0.3, 0.05);
      if (a1 > 0.01) { const [mx, my] = proj(c, app, 0, 1.15, -10);
        T(g, 'THE FULL MOON', mx, my - 12 * S(), { size: 28, align: 'center', alpha: a1, sp: 5, color: '#e8eefc' });
        { const lab = 'THIS PATCH ≈ 1/10 THE MOON’S WIDTH'; if (A.portrait) wrapText(g, lab, W * 0.8, 30, 600).forEach((ln, i) => T(g, ln, W / 2, H * 0.6 + i * 40 * S(), { size: 30, align: 'center', alpha: a1, sp: 3, color: '#7fe3ff' })); else T(g, lab, cx - half, cy + half + 52 * S(), { size: 26, align: 'left', alpha: a1, sp: 3, color: '#7fe3ff' }); } }
      const a2 = win(p, 0.34, 0.6, 0.05); if (a2 > 0.01) T(g, 'CONSTELLATION FORNAX', W / 2, H * 0.12, { size: 32, align: 'center', alpha: a2, sp: 10, color: '#9fc4ff' });
      const a3 = win(p, 0.7, 1.01, 0.08); if (a3 > 0.01) { T(g, 'FROM THE GROUND: ALMOST NOTHING', W / 2, H * 0.5, { size: A.portrait ? 44 : 64, weight: 800, align: 'center', alpha: a3, glow: 24, glowColor: '#6fa8ff', sp: 3 }); }
    },
  };

  // ---------------- HUBBLE ----------------
  sc.hubble = {
    title: '02 · HUBBLE’S LEGACY',
    build() {
      this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(40, app.aspect, 0.5, 4000);
      this.hub = buildHubble(); this.s.add(this.hub);
      this.earth = buildEarth(); this.earth.scale.setScalar(60); this.earth.position.set(0, -66, 0); this.s.add(this.earth);
      this.stars = makeStars(4000, 1500, 21); this.s.add(this.stars);
      const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(30, 20, 25); this.s.add(key); this.s.add(new THREE.HemisphereLight(0x6f9cff, 0x101830, 0.6));
      const pm = new THREE.PMREMGenerator(app.renderer); this.s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.s.environmentIntensity = 0.35;
    },
    update(p) {
      const U = this.s; let P;
      if (p < 0.52) {
        this.active = [this.s, this.c]; const q = p / 0.52;
        this.c.aspect = app.aspect; this.c.updateProjectionMatrix();
        const a = 0.7 + q * 1.4; this.c.position.set(Math.sin(a) * 24, 5 + q * 3, Math.cos(a) * 24); this.c.lookAt(0, -1, 0);
        this.hub.rotation.set(0.25, 0.4 + q * 0.5, 0.15); this.earth.rotation.set(0.9, q * 0.4, 0.2); this.earth.userData.earth.material.uniforms.uT.value = q * 1.5;
        this.stars.material.uniforms.uPx.value = app.S * 1.3;
        P = base({ mesh: true, bloom: 0.8, exposure: 1.0 });
      } else {
        const pl = plane(app); this.active = [pl.scene, pl.camera]; const q = (p - 0.52) / 0.48;
        setPlaneCam(pl, app, lerp(-0.1, 0.1, q), 0, lerp(2.1, 1.9, q));
        const u = pl.field.uniforms; u.uHubble.value = 1; u.uColorMode.value = 1; u.uReveal.value = 1; u.uRedden.value = 0; u.uBright.value = 1; u.uOnlyMiri.value = 0; u.uSizeMul.value = 1; pl.sp.material.uniforms.uBright.value = 0.9;
        const e = Math.pow(smooth(0.0, 0.8, q), 1.4) * 0.97 + 0.03;
        P = base({ expo: e, gain: 5200, bg: 0.045, stretch: 45, mono: 0.0, bloom: 0.8 });
      }
      P.fade = smooth(0.47, 0.515, p) * (1 - smooth(0.515, 0.56, p)); return P;
    },
    hud(g, p) {
      const W = app.W, H = app.H, ps = A.portrait;
      if (p < 0.52) {
        const q = p / 0.52; const x = ps ? W * 0.07 : W * 0.6;
        const rows = [['400', 'ORBITS OF EARTH', Math.round(400 * easeOut(smooth(0.05, 0.8, q)))], ['800', 'EXPOSURES', Math.round(800 * easeOut(smooth(0.1, 0.85, q)))], ['11.3', 'DAYS OF TOTAL EXPOSURE', 11.3 * easeOut(smooth(0.15, 0.9, q))]];
        T(g, 'SEPT 24, 2003  →  JAN 16, 2004', x, H * 0.12, { size: 30, sp: 5, color: '#9fc4ff', alpha: smooth(0, 0.1, q) });
        rows.forEach((r, i) => { const a = smooth(0.1 + i * 0.12, 0.25 + i * 0.12, q); const y = H * 0.74 + i * 96 * S() - (ps ? 0 : 0);
          T(g, r[0] === '11.3' ? r[2].toFixed(1) : fmt(r[2]), x, y, { size: 84, weight: 800, alpha: a, glow: 18, glowColor: '#6fa8ff' }); T(g, r[1], x + measure(g, '000', 84, 800) + 36 * S(), y - 10 * S(), { size: 26, alpha: a * 0.9, sp: 4, color: '#9fc4ff' }); });
      } else {
        const q = (p - 0.52) / 0.48;
        bigTitle(g, 'HUBBLE ULTRA DEEP FIELD', q, 0.04, 0.4, 0.14, 70);
        const n = Math.round(9800 * easeOut(smooth(0.1, 0.85, q))); const a = smooth(0.18, 0.3, q);
        T(g, '≈' + fmt(n), A.W * 0.06, H * 0.88, { size: 120, weight: 800, alpha: a, glow: 26, glowColor: '#6fa8ff' }); T(g, 'GALAXIES — MOSTLY VISIBLE LIGHT', A.W * 0.06 + 24 * S(), H * 0.88 + 44 * S(), { size: 26, alpha: a, sp: 5, color: '#9fc4ff' });
        const b = win(q, 0.74, 1.0, 0.08); T(g, 'THE EARLIEST & DUSTIEST GALAXIES STAY HIDDEN', W / 2, H * 0.5, { size: ps ? 40 : 56, weight: 800, align: 'center', alpha: b, glow: 24, glowColor: '#ff9a6a', sp: 2, color: '#ffd3b8' });
      }
    },
  };

  // ---------------- REDSHIFT ----------------
  const nm2rgb = (nm) => { let r = 0, g = 0, b = 0;
    if (nm < 380) { r = 0.45; g = 0; b = 0.9; } else if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else r = 1;
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? Math.max(0, 0.3 + 0.7 * (780 - nm) / 80) : 1; return [r * f, g * f, b * f]; };
  sc.redshift = {
    title: '03 · WHY INFRARED',
    build() { this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(40, app.aspect, 0.1, 100); this.stars = makeStars(900, 40, 4); this.s.add(this.stars); this.c.position.set(0, 0, 0); },
    update(p) { this.active = [this.s, this.c]; this.stars.material.uniforms.uPx.value = app.S; this.stars.material.uniforms.uBright.value = 0.35; this.c.aspect = app.aspect; this.c.updateProjectionMatrix(); this.c.rotation.y = p * 0.2; return base({ bloom: 0.8 }); },
    hud(g, p, t) {
      const W = app.W, H = app.H, s = S(); const x0 = W * 0.12, x1 = W * 0.88, y = H * 0.42;
      const zstr = 6 * easeInOut(smooth(0.05, 0.55, p)); // stretch factor
      // source galaxy + observer
      const gr = g.createRadialGradient(x0 - 30 * s, y, 0, x0 - 30 * s, y, 90 * s); gr.addColorStop(0, 'rgba(160,200,255,.95)'); gr.addColorStop(0.3, 'rgba(110,160,255,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x0 - 140 * s, y - 120 * s, 220 * s, 240 * s);
      T(g, 'DISTANT GALAXY', x0 - 30 * s, y + 140 * s, { size: 22, align: 'center', sp: 4, color: '#9fc4ff' }); T(g, 'WEBB', x1 + 10 * s, y + 140 * s, { size: 22, align: 'center', sp: 4, color: '#ffd9a0' });
      g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(x1 + 10 * s, y, 12 * s, 0, 6.283); g.fill();
      // expanding-space grid
      for (let i = 0; i <= 14; i++) { const f = i / 14; const xx = x0 + (x1 - x0) * (Math.pow(f, 1) + (zstr / 6) * 0.0); const dx = lerp(f, f * f * 0.5 + f * 0.5, zstr / 6); g.strokeStyle = 'rgba(120,160,255,.12)'; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(x0 + (x1 - x0) * dx, y - 190 * s); g.lineTo(x0 + (x1 - x0) * dx, y + 190 * s); g.stroke(); }
      // wave
      const N = 600; let phase = -t * 14; const lam0 = 26 * s; let px = x0, py = y; g.lineWidth = 6 * s; g.lineCap = 'round';
      for (let i = 1; i <= N; i++) { const f = i / N; const st = 1 + zstr * Math.pow(f, 1.3); const xx = x0 + (x1 - x0) * f; phase += ((x1 - x0) / N) / (lam0 * st) * 6.283;
        const nmv = 420 * st; const [r, gg, b] = nm2rgb(nmv); const ir = clamp((nmv - 700) / 500); const amp = 62 * s * (1 - 0.15 * f); const yy = y + Math.sin(phase) * amp * (1 - 0.35 * ir);
        const al = nmv > 750 ? clamp(0.9 - ir * 0.75, 0.18, 1) : 1; g.strokeStyle = `rgba(${Math.round(255 * Math.min(1, r * 1.2 + (nmv > 750 ? 0.35 : 0)))},${Math.round(255 * gg)},${Math.round(255 * b)},${al})`;
        if (nmv > 900 && Math.floor(i / 6) % 2) { px = xx; py = yy; continue; } g.beginPath(); g.moveTo(px, py); g.lineTo(xx, yy); g.stroke(); px = xx; py = yy; }
      // wavelength readout
      const nmNow = 420 * (1 + zstr); const a = smooth(0.08, 0.2, p);
      T(g, `WAVELENGTH  ${(nmNow / 1000).toFixed(2)} µm`, W / 2, H * 0.16, { size: 40, weight: 700, align: 'center', alpha: a, sp: 3, color: nmNow > 750 ? '#ff9a7a' : '#cfe0ff' });
      T(g, nmNow > 750 ? 'INVISIBLE TO HUMAN EYES — INFRARED' : 'VISIBLE LIGHT', W / 2, H * 0.16 + 46 * s, { size: 24, align: 'center', alpha: a, sp: 5, color: nmNow > 750 ? '#ff7a5a' : '#8fb4ff' });
      // spectrum bar (log scale 0.3–30 µm)
      const sb = smooth(0.52, 0.7, p); if (sb > 0.01) { const bx0 = W * 0.08, bx1 = W * 0.92, by = H * 0.74, bh = 26 * s; const X = (um) => bx0 + (bx1 - bx0) * (Math.log(um / 0.3) / Math.log(100));
        const lg = g.createLinearGradient(X(0.38), 0, X(0.75), 0); lg.addColorStop(0, '#6a3cff'); lg.addColorStop(.3, '#2f8bff'); lg.addColorStop(.5, '#3fe08a'); lg.addColorStop(.75, '#ffd23a'); lg.addColorStop(1, '#ff3a2a');
        g.save(); g.globalAlpha = sb; g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(bx0, by, bx1 - bx0, bh); g.fillStyle = lg; g.fillRect(X(0.38), by, X(0.75) - X(0.38), bh);
        const bands = [['HUBBLE', 0.2, 1.7, '#7fb2ff', 0], ['NIRCAM', 0.6, 5, '#ffd27a', 1], ['MIRI', 5, 28.5, '#ff7a5a', 2]];
        bands.forEach(([n, a0, a1, col, row]) => { const k = smooth(0.58 + row * 0.07, 0.68 + row * 0.07, p); g.globalAlpha = sb * k; const yy = by + 74 * s + row * 40 * s; g.fillStyle = col; g.fillRect(X(Math.max(a0, 0.3)), yy, X(a1) - X(Math.max(a0, 0.3)), 12 * s); T(g, n, X(Math.max(a0, 0.3)), yy - 6 * s, { size: 20, sp: 4, color: col }); });
        g.globalAlpha = sb; [[0.5, '0.5 µm'], [1, '1'], [5, '5'], [10, '10'], [28, '28 µm']].forEach(([u, l]) => T(g, l, X(u), by - 10 * s, { size: 18, align: 'center', color: '#9fb4d8' })); T(g, 'VISIBLE', (X(0.38) + X(0.75)) / 2, by + bh + 22 * s, { size: 16, align: 'center', color: '#cfe0ff', sp: 3 }); g.restore(); }
      const d = win(p, 0.74, 1.01, 0.06); if (d > 0.01) T(g, 'DUST ALSO GLOWS IN THE INFRARED', W / 2, H * 0.28, { size: 38, weight: 700, align: 'center', alpha: d, sp: 4, color: '#ffb48a', glow: 20, glowColor: '#ff7a4a' });
    },
  };

  // ---------------- WEBB ----------------
  sc.webb = {
    title: '04 · MEET WEBB',
    build() {
      this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(36, app.aspect, 0.5, 3000);
      this.m = buildWebb(); this.s.add(this.m); this.stars = makeStars(3500, 1200, 17); this.s.add(this.stars);
      const key = new THREE.DirectionalLight(0xfff0d8, 3.4); key.position.set(-10, -30, 14); this.s.add(key);
      const fill = new THREE.DirectionalLight(0x9db8ff, 0.9); fill.position.set(14, 20, -10); this.s.add(fill); this.s.add(new THREE.HemisphereLight(0x8aa6ff, 0x221a33, 0.4));
      const pm = new THREE.PMREMGenerator(app.renderer); this.s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.s.environmentIntensity = 0.45;
    },
    update(p) {
      this.active = [this.s, this.c]; const d = this.m.userData;
      d.segs.forEach((m, i) => { const k = easeOut((p * 3.2 - i * 0.05)); m.scale.setScalar(Math.max(0.001, k)); m.visible = k > 0.01; });
      const open = easeInOut(smooth(0.4, 0.62, p)); d.layers.forEach((m, i) => { m.position.y = -1.5 - i * (0.05 + 0.42 * open); });
      this.c.aspect = app.aspect; this.c.fov = app.portrait ? 50 : 36; this.c.updateProjectionMatrix();
      const a = lerp(-0.9, 0.95, easeInOut(p)); const r = lerp(28, 23, p) * (app.portrait ? 1.35 : 1); this.c.position.set(Math.sin(a) * r, lerp(8, 4, p), Math.cos(a) * r); this.c.lookAt(0, 0.6, 1.5); this.c.updateMatrixWorld();
      this.stars.material.uniforms.uPx.value = app.S * 1.3; return base({ mesh: true, bloom: 0.9, exposure: 1.05 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const c = this.c;
      const label = (wx, wy, wz, txt, sub, a, dx, dy) => { if (a < 0.01) return; const [x, y] = proj(c, app, wx, wy, wz); const lx = x + dx * s, ly = y + dy * s;
        g.save(); g.globalAlpha = a; g.strokeStyle = 'rgba(160,210,255,.8)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(lx, ly); g.lineTo(lx + (dx > 0 ? 40 : -40) * s, ly); g.stroke(); g.fillStyle = '#9fd0ff'; g.beginPath(); g.arc(x, y, 6 * s, 0, 6.283); g.fill(); g.restore();
        const al = dx > 0 ? 'left' : 'right'; const tx = lx + (dx > 0 ? 52 : -52) * s; T(g, txt, tx, ly - 6 * s, { size: 34, weight: 800, align: al, alpha: a }); T(g, sub, tx, ly + 28 * s, { size: 22, align: al, alpha: a * 0.85, sp: 2, color: '#9fc4ff' }); };
      const wm = this.m.userData.mirror.position;
      label(wm.x, wm.y + 0.8, wm.z, '6.5 m MIRROR', '18 GOLD-COATED HEXAGONS', win(p, 0.12, 0.45, 0.06), A.portrait ? -90 : -170, -140);
      label(5.5, -2.5, 3, '5-LAYER SUNSHIELD', 'ABOUT THE SIZE OF A TENNIS COURT', win(p, 0.52, 0.8, 0.06), A.portrait ? 60 : 170, 150);
      const b = win(p, 0.82, 1.01, 0.08); if (b > 0.01) T(g, 'INFRARED = HEAT → KEEP IT COLD', W / 2, H * 0.12, { size: A.portrait ? 38 : 54, weight: 800, align: 'center', alpha: b, glow: 22, glowColor: '#6fa8ff', sp: 2 });
    },
  };

  // ---------------- MIRI ----------------
  const tempAt = (p) => p < 0.12 ? 300 : p < 0.38 ? Math.exp(lerp(Math.log(300), Math.log(90), easeInOut((p - 0.12) / 0.26))) : p < 0.5 ? 90 : p < 0.86 ? Math.exp(lerp(Math.log(90), Math.log(6.4), easeInOut((p - 0.5) / 0.36))) : 6.4;
  sc.miri = {
    title: '05 · THE COLDEST EYE',
    build() {
      this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(38, app.aspect, 0.1, 50);
      this.mat = new THREE.ShaderMaterial({ uniforms: { uHot: { value: 1 }, uT: { value: 0 }, uAsp: { value: 1.6 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float uHot,uT,uAsp; varying vec2 vUv;
        float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        void main(){ vec2 uv=vUv; vec2 G=vec2(56.*uAsp,56.); vec2 cell=floor(uv*G); vec2 l=fract(uv*G);
          float body=smoothstep(0.,.1,l.x)*smoothstep(1.,.9,l.x)*smoothstep(0.,.1,l.y)*smoothstep(1.,.9,l.y);
          float base=.05+.07*h(cell)+.05*uv.x;
          float hotr=h(cell+floor(uT*9.));
          float hot=step(1.-uHot*.08,hotr)*(.4+.6*h(cell*3.1))*(.25+uHot*.9);
          float ph=step(.9985,h(cell+floor(uT*2.5)+7.))*2.;
          vec3 col=vec3(.04,.1,.26)*base*3.+vec3(1.,.5,.16)*hot*(1.2+uHot*1.5)+vec3(.3,.9,1.)*ph*(1.-uHot*.7);
          col*=body; float edge=step(.02,uv.x)*step(uv.x,.98)*step(.03,uv.y)*step(uv.y,.97);
          col=mix(vec3(.55,.42,.12)*(.2+.2*h(floor(uv*80.))),col,edge);
          gl_FragColor=vec4(col,1.); }` });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), this.mat); this.s.add(m); this.m = m;
    },
    update(p, a, t) {
      this.active = [this.s, this.c]; const T_ = tempAt(p); const hot = clamp((Math.log(T_) - Math.log(6.4)) / (Math.log(300) - Math.log(6.4)));
      this.mat.uniforms.uHot.value = hot; this.mat.uniforms.uT.value = t; this.mat.uniforms.uAsp.value = 4.2 / 2.6;
      this.c.aspect = app.aspect; this.c.updateProjectionMatrix(); const sw = Math.sin(p * 3) * 0.25; this.c.position.set(sw, 0.1 + Math.cos(p * 2) * 0.1, app.portrait ? 6.2 : 3.4 - p * 0.3); this.c.lookAt(0, 0, 0);
      return base({ bloom: 1.3, exposure: 1.1, mesh: false, thr: 0.8 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const Tn = tempAt(p); const hot = clamp((Math.log(Tn) - Math.log(5)) / (Math.log(300) - Math.log(5)));
      const tx = W * (A.portrait ? 0.08 : 0.07), ty0 = H * 0.2, ty1 = H * 0.8; const Y = (k) => ty1 - (ty1 - ty0) * (Math.log(k / 5) / Math.log(300 / 5));
      panel(g, tx - 24 * s, ty0 - 70 * s, 360 * s, (ty1 - ty0) + 160 * s, 0.45);
      g.strokeStyle = 'rgba(190,220,255,.6)'; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(tx, ty0); g.lineTo(tx, ty1); g.stroke();
      [[300, 'ROOM TEMP'], [90, 'AFTER SUNSHIELD'], [40, 'NIRCAM · PASSIVE'], [6.4, 'MIRI TARGET']].forEach(([k, l]) => { const y = Y(k); g.strokeStyle = 'rgba(190,220,255,.7)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(tx - 8 * s, y); g.lineTo(tx + 22 * s, y); g.stroke(); T(g, `${k} K`, tx + 34 * s, y + 8 * s, { size: 24, weight: 700 }); T(g, l, tx + 34 * s, y + 32 * s, { size: 14, sp: 2, color: '#8fb4ff', alpha: 0.9 }); });
      const yc = Y(Tn); g.fillStyle = Tn > 20 ? '#ff9a5a' : '#5fd8ff'; g.shadowColor = g.fillStyle; g.shadowBlur = 18 * s; g.beginPath(); g.arc(tx, yc, 11 * s, 0, 6.283); g.fill(); g.shadowBlur = 0;
      T(g, (Tn >= 100 ? Math.round(Tn) : Tn.toFixed(1)) + ' K', W / 2, H * (A.portrait ? 0.17 : 0.2), { size: A.portrait ? 110 : 150, weight: 800, align: 'center', color: Tn > 20 ? '#ffb27a' : '#7fe3ff', glow: 36, glowColor: Tn > 20 ? '#ff8a3a' : '#35c9ff' });
      T(g, 'MIRI DETECTOR TEMPERATURE', W / 2, H * (A.portrait ? 0.17 : 0.2) + 48 * s, { size: 24, align: 'center', sp: 8, color: '#9fc4ff' });
      const items = [[0.02, 0.2, 'MIRI · 5–28.5 µm MID-INFRARED'], [0.4, 0.55, 'SUNSHIELD ALONE: ≈ 90 K — NOT ENOUGH'], [0.55, 0.78, 'DEDICATED HELIUM CRYOCOOLER (JPL)'], [0.7, 0.9, '+1 K WARMER → ≈ 10× MORE DETECTOR NOISE'], [0.86, 1.01, '6.4 K · APRIL 2022']];
      items.forEach(([a, b, txt]) => { const v = win(p, a, b, 0.04); if (v > 0.01) T(g, txt, W / 2, H * 0.9, { size: A.portrait ? 30 : 42, weight: 700, align: 'center', alpha: v, sp: 2, glow: 14, glowColor: '#4aa8ff' }); });
    },
  };

  // ---------------- EXPOSURE ----------------
  const hoursAt = (p) => 100 * Math.pow(clamp((p - 0.12) / 0.74), 1.5);
  sc.exposure = {
    title: '06 · 100 HOURS',
    build() {},
    update(p) {
      const pl = plane(app); this.active = [pl.scene, pl.camera]; this.pl = pl;
      setPlaneCam(pl, app, lerp(-0.12, 0.12, p), 0, lerp(2.15, 1.8, p));
      const u = pl.field.uniforms; u.uHubble.value = 0; u.uColorMode.value = 0; u.uReveal.value = 1; u.uRedden.value = 0; u.uBright.value = 1; u.uOnlyMiri.value = 0; u.uSizeMul.value = 1; pl.sp.material.uniforms.uBright.value = 0.9;
      const hrs = hoursAt(p); const e = Math.max(0.0015, hrs / 100);
      const mono = 1 - smooth(0.88, 0.97, p);
      return base({ expo: e, gain: 1400, bg: 0.05, stretch: 14, mono, bloom: 0.8, seed: 0, grain: 0.0 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const hrs = hoursAt(p); const x = W * 0.06;
      T(g, 'HOURS OF EXPOSURE', x, H * 0.11, { size: 26, sp: 6, color: '#9fc4ff' });
      T(g, hrs.toFixed(1), x, H * 0.11 + 120 * s, { size: 130, weight: 800, glow: 28, glowColor: '#6fa8ff' });
      const bw = W * (A.portrait ? 0.84 : 0.34), by = H * 0.11 + 160 * s; g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(x, by, bw, 10 * s); g.fillStyle = '#7fb2ff'; g.fillRect(x, by, bw * hrs / 100, 10 * s);
      g.fillStyle = '#ffd27a'; g.fillRect(x + bw * 0.41 - 1.5 * s, by - 10 * s, 3 * s, 30 * s); T(g, '41 h', x + bw * 0.41, by + 52 * s, { size: 20, align: 'center', color: '#ffd27a', sp: 2 }); T(g, '100 h', x + bw, by + 52 * s, { size: 20, align: 'right', color: '#9fc4ff', sp: 2 });
      const mono = p < 0.9; T(g, mono ? 'MIRI · 5.6 µm FILTER' : 'MIRI + NIRCAM · COLOUR COMPOSITE', W - x, H * 0.11, { size: 26, align: 'right', sp: 5, color: mono ? '#ffc98a' : '#9fffd0' });
      const a = win(p, 0.4, 0.68, 0.05); if (a > 0.01) wrapText(g, '41 HOURS IN ONE FILTER — WEBB’S LONGEST ON AN EXTRAGALACTIC FIELD', W * (A.portrait ? 0.84 : 0.9), A.portrait ? 32 : 36, 700).forEach((ln, i) => T(g, ln, W / 2, H * (A.portrait ? 0.84 : 0.9) + i * 44 * s, { size: A.portrait ? 32 : 36, weight: 700, align: 'center', alpha: a, color: '#ffe6b0', glow: 16, glowColor: '#ffb84a' }));
      const b = win(p, 0.0, 0.14, 0.03); if (b > 0.01) T(g, 'JUST NOISE…', W / 2, H * 0.5, { size: 90, weight: 800, align: 'center', alpha: b, glow: 22, glowColor: '#6fa8ff', sp: 4 });
      T(g, 'ILLUSTRATIVE SIMULATION', W - x, H * 0.96, { size: 18, align: 'right', sp: 5, alpha: 0.55, color: '#9fc4ff' });
    },
  };

  // ---------------- SOURCES ----------------
  sc.sources = {
    title: '07 · 2,500 SOURCES',
    build() {},
    update(p) {
      const pl = plane(app); this.active = [pl.scene, pl.camera]; this.pl = pl;
      setPlaneCam(pl, app, lerp(0.15, -0.1, p), lerp(0.05, -0.03, p), lerp(1.95, 1.7, p));
      const u = pl.field.uniforms; u.uHubble.value = 0; u.uColorMode.value = 0; u.uReveal.value = 1; u.uRedden.value = 0; u.uBright.value = 1.15; u.uOnlyMiri.value = 0; u.uSizeMul.value = 1; pl.sp.material.uniforms.uBright.value = 1;
      return base({ bloom: 1.0, exposure: 1.1, thr: 0.8 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const pl = this.pl; const cat = app.catalog; const rev = easeOut(smooth(0.1, 0.62, p));
      const cols = ['rgba(90,200,255,.8)', 'rgba(255,140,60,.95)', 'rgba(120,255,170,.95)']; const pxu = H / pl.viewH; g.lineWidth = 1.4 * s;
      const showCat = [smooth(0.5, 0.56, p) + 0.0, smooth(0.2, 0.26, p), smooth(0.36, 0.42, p)];
      for (let k = 0; k < pl.field.idx.length; k++) { const i = pl.field.idx[k]; if (!cat.miri[i] || cat.order[i] > rev) continue; const [x, y] = proj(pl.camera, app, cat.x[i], cat.y[i]); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const c = cat.cat[i]; const rr = Math.max(cat.size[i] * pxu * 1.1, 5 * s); const hl = c === 0 ? 0.55 : 1; g.strokeStyle = cols[c]; g.globalAlpha = hl * (c === 0 ? 0.5 : 0.9); g.beginPath(); if (c === 1) g.rect(x - rr, y - rr, rr * 2, rr * 2); else g.arc(x, y, rr, 0, 6.283); g.stroke(); }
      g.globalAlpha = 1;
      const n = Math.floor(2500 * rev); const x = W * 0.06;
      T(g, 'SOURCES DETECTED', x, H * 0.1, { size: 26, sp: 6, color: '#9fc4ff' }); T(g, fmt(n) + (n >= 2500 ? '+' : ''), x, H * 0.1 + 120 * s, { size: 130, weight: 800, glow: 28, glowColor: '#6fa8ff' });
      const leg = [[1, 'ORANGE / RED — DUSTY OR EVOLVED GALAXIES'], [2, 'GREENISH-WHITE — VERY DISTANT, HIGH REDSHIFT'], [0, 'BLUE / CYAN — BRIGHT IN THE NEAR-INFRARED']];
      const order = [1, 2, 0]; order.forEach((c, i) => { const a = showCat[c === 0 ? 0 : c]; const y = H * (A.portrait ? 0.34 : 0.36) + i * 46 * s; if (a < 0.02) return; g.save(); g.globalAlpha = a; g.strokeStyle = cols[c]; g.lineWidth = 3 * s; g.beginPath(); if (c === 1) g.rect(x, y - 20 * s, 24 * s, 24 * s); else g.arc(x + 12 * s, y - 8 * s, 12 * s, 0, 6.283); g.stroke(); g.restore(); T(g, leg.find((l) => l[0] === c)[1], x + 42 * s, y, { size: A.portrait ? 20 : 24, alpha: a, sp: 2 }); });
      const stats = [[0.62, 0.74, '>500', 'GALAXIES WITH MEASURED DISTANCES — UP TO z ≈ 11'], [0.74, 0.87, '~25', 'AT z = 6–12 · THE FIRST BILLION YEARS'], [0.87, 1.01, '>100', 'EXTREMELY RED — NEARLY INVISIBLE WITHOUT WEBB']];
      stats.forEach(([a, b, big, txt]) => { const v = win(p, a, b, 0.03); if (v < 0.01) return; panel(g, W / 2 - W * (A.portrait ? 0.44 : 0.3), H * 0.82 - 50 * s, W * (A.portrait ? 0.88 : 0.6), 140 * s, 0.6 * v);
        T(g, big, W / 2 - W * (A.portrait ? 0.4 : 0.27), H * 0.82 + 52 * s, { size: 86, weight: 800, alpha: v, color: '#ffd27a', glow: 18, glowColor: '#ffb84a' }); T(g, txt, W / 2 - W * (A.portrait ? 0.4 : 0.27) + measure(g, '>500', 86, 800) + 28 * s, H * 0.82 + 40 * s, { size: A.portrait ? 20 : 26, alpha: v, sp: 2 }); });
    },
  };

  // ---------------- VIRGIL ----------------
  const mini = (items) => { const n = items.length; const c = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), flux: new Float32Array(n), size: new Float32Array(n), q: new Float32Array(n), rot: new Float32Array(n), type: new Float32Array(n), seed: new Float32Array(n), col: new Float32Array(n * 3), cat: new Uint8Array(n), miri: new Uint8Array(n), hub: new Uint8Array(n), order: new Float32Array(n) };
    items.forEach((it, i) => { c.x[i] = it.x; c.y[i] = it.y; c.z[i] = it.z ?? 1; c.flux[i] = it.f; c.size[i] = it.s; c.q[i] = it.q ?? 1; c.rot[i] = it.r ?? 0; c.type[i] = it.t ?? 0; c.seed[i] = it.sd ?? 0.3; c.col.set(it.c, i * 3); c.hub[i] = 1; c.order[i] = it.o ?? 0; }); return c; };
  sc.virgil = {
    title: '08 · THE LITTLE RED DOT',
    build() {
      this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(30, app.aspect, 0.1, 50);
      const ctx = [[-0.35, 0.4, 0.09, 0.7, 1, 0.6], [0.3, -0.38, 0.12, 0.9, 2, 0.5], [-0.15, -0.35, 0.07, 0.5, 0, 0.8], [0.4, 0.3, 0.08, 0.6, 1, 0.7]].map((a, i) => ({ x: a[0], y: a[1], s: a[2], f: a[3], t: a[4], q: a[5], c: [0.6, 0.8, 1], r: i, sd: i * 0.37 }));
      const L = -0.95, R = 0.95;
      const left = [...ctx.map((o) => ({ ...o, x: o.x + L })), { x: L, y: 0, s: 0.05, f: 0.55, t: 0, c: [1, 0.45, 0.3], o: 0 }];
      const right = [...ctx.map((o) => ({ ...o, x: o.x + R })), { x: R, y: 0, s: 0.42, f: 0.32, t: 1, q: 0.65, r: 0.5, c: [1, 0.5, 0.25], o: 0.5 }, { x: R, y: 0, s: 0.075, f: 4.5, t: 0, c: [1, 0.18, 0.1], o: 0.5 }];
      this.cL = mini(left); this.cR = mini(right);
      this.fL = new GalaxyField(this.cL); this.fR = new GalaxyField(this.cR); this.s.add(this.fL.mesh, this.fR.mesh);
    },
    update(p) {
      this.active = [this.s, this.c]; this.c.aspect = app.aspect; this.c.updateProjectionMatrix();
      const vh = app.portrait ? 4.4 : 2.5; const z = (vh / 2) / Math.tan(THREE.MathUtils.degToRad(15)); this.c.position.set(0, app.portrait ? 0 : 0, z); this.c.lookAt(0, 0, 0); this.c.updateMatrixWorld();
      const a = smooth(0.08, 0.22, p), b = smooth(0.36, 0.5, p); [this.fL, this.fR].forEach((f) => { f.uniforms.uBright.value = 1.5; });
      this.fL.uniforms.uReveal.value = a * 2; this.fR.uniforms.uReveal.value = b * 2; this.fR.uniforms.uSizeMul.value = 1.3; this.fL.uniforms.uSizeMul.value = 1.3; return base({ bloom: 1.5, exposure: 1.4, thr: 0.6 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const pv = (x, y) => proj(this.c, app, x, y);
      const panelBox = (cx, label, sub, a, col) => { if (a < 0.01) return; const [x0, y0] = pv(cx - 0.72, 0.7), [x1, y1] = pv(cx + 0.72, -0.7); g.save(); g.globalAlpha = a; bracket(g, x0, y0, x1 - x0, y1 - y0, 40 * s, col, 3); T(g, label, (x0 + x1) / 2, y0 - 24 * s, { size: 30, weight: 800, align: 'center', sp: 4, color: col }); T(g, sub, (x0 + x1) / 2, y1 + 40 * s, { size: 22, align: 'center', sp: 3, color: '#cfe0ff' }); g.restore(); };
      panelBox(-0.95, 'NEAR-INFRARED ONLY', 'FAINT, ORDINARY-LOOKING DOT', smooth(0.1, 0.22, p), '#7fb2ff');
      panelBox(0.95, 'ADD MIRI', 'EXTREMELY RED GLOW + HOST GALAXY', smooth(0.38, 0.5, p), '#ff9a6a');
      const t = win(p, 0.0, 0.16, 0.04); if (t > 0.01) T(g, 'VIRGIL · z ≈ 6.6', W / 2, H * 0.1, { size: 54, weight: 800, align: 'center', alpha: t, glow: 22, glowColor: '#ff7a4a', color: '#ffd3b8', sp: 6 });
      const hv = smooth(0.0, 0.12, p) * 0 + 1; T(g, 'VIRGIL · z ≈ 6.6', W / 2, H * 0.08, { size: 34, weight: 700, align: 'center', alpha: smooth(0.16, 0.26, p) * 0.9, sp: 8, color: '#ffb48a' });
      const c = win(p, 0.66, 1.02, 0.06); if (c > 0.01) { T(g, 'THAT RED GLOW HINTS AT AN ACTIVE BLACK HOLE', W / 2, H * 0.9, { size: A.portrait ? 30 : 44, weight: 800, align: 'center', alpha: c, glow: 20, glowColor: '#ff6a3a', color: '#ffd3b8' }); }
      T(g, 'ILLUSTRATIVE — BASED ON MIDIS / IANI ET AL.', W / 2, H * 0.96, { size: 18, align: 'center', sp: 5, alpha: 0.55, color: '#9fc4ff' });
    },
  };

  // ---------------- DAWN ----------------
  sc.dawn = {
    title: '09 · COSMIC DAWN',
    build() { this.s = new THREE.Scene(); this.c = new THREE.PerspectiveCamera(66, app.aspect, 0.05, 1000); this.field = new GalaxyField(app.catalog, { cone: true, sizeScale: 1.0, coneW: 0.17, zMax: 23 }); this.s.add(this.field.mesh); },
    zc(p) { return 14.6 * easeInOut(smooth(0.04, 0.82, p)); },
    update(p) {
      this.active = [this.s, this.c]; const u = this.field.uniforms; u.uRedden.value = 1; u.uBright.value = 1.8; u.uNear.value = 1; u.uSizeMul.value = 0.6; this.c.aspect = app.aspect; this.c.updateProjectionMatrix();
      const zc = this.zc(p); const dz = DIST(zc) - 4; this.c.position.set(Math.sin(p * 3) * 1.2, Math.cos(p * 2.2) * 0.6, -dz); this.c.lookAt(this.c.position.x * 0.2, this.c.position.y * 0.2, -dz - 50);
      return base({ bloom: 1.3, exposure: 1.3, thr: 0.7 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const zc = this.zc(p); const age = cosmicAge(zc); const x = W * 0.06;
      T(g, 'REDSHIFT  z', x, H * 0.11, { size: 26, sp: 6, color: '#9fc4ff' }); T(g, zc.toFixed(2), x, H * 0.11 + 120 * s, { size: 130, weight: 800, glow: 28, glowColor: '#ff8a5a', color: zc > 8 ? '#ffb48a' : '#fff' });
      const ageTxt = age < 1 ? `≈ ${Math.round(age * 1000 / 10) * 10} MILLION YEARS AFTER THE BIG BANG` : `≈ ${age.toFixed(1)} BILLION YEARS AFTER THE BIG BANG`; T(g, ageTxt, x, H * 0.11 + 170 * s, { size: A.portrait ? 20 : 26, sp: 2, color: '#cfe0ff' });
      const bx0 = W * 0.06, bx1 = W * 0.94, by = H * 0.9; g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(bx0, by, bx1 - bx0, 6 * s); const X = (z) => bx0 + (bx1 - bx0) * z / 15; g.fillStyle = '#ff9a6a'; g.fillRect(bx0, by, X(zc) - bx0, 6 * s);
      [[2, '2'], [6, '6'], [10, '10'], [14.32, '14.3']].forEach(([z, l]) => T(g, l, X(z), by + 34 * s, { size: 18, align: 'center', color: '#9fb4d8' }));
      const f1 = smooth(14.2, 14.32, zc), f2 = smooth(14.35, 14.44, zc);
      if (f1 > 0.01) { const py = A.portrait ? H * 0.3 : H * 0.14; panel(g, W * (A.portrait ? 0.06 : 0.56), py, W * (A.portrait ? 0.88 : 0.38), 120 * s, 0.6 * f1, 'rgba(255,170,120,.5)'); T(g, 'JADES-GS-z14-0 · 2024', W * (A.portrait ? 0.09 : 0.58), py + 48 * s, { size: 32, weight: 800, alpha: f1, color: '#ffd3b8' }); T(g, 'z = 14.32 · ~290 MILLION YEARS AFTER THE BIG BANG', W * (A.portrait ? 0.09 : 0.58), py + 90 * s, { size: 20, alpha: f1, sp: 1, color: '#ffb48a' }); }
      if (f2 > 0.01) { const py = (A.portrait ? H * 0.3 : H * 0.14); panel(g, W * (A.portrait ? 0.06 : 0.56), py + 150 * s, W * (A.portrait ? 0.88 : 0.38), 120 * s, 0.6 * f2, 'rgba(255,120,80,.7)'); T(g, 'MoM-z14 · JAN 2026', W * (A.portrait ? 0.09 : 0.58), py + 198 * s, { size: 32, weight: 800, alpha: f2, color: '#fff' }); T(g, 'z = 14.44 · ~280 MILLION YEARS AFTER THE BIG BANG', W * (A.portrait ? 0.09 : 0.58), py + 240 * s, { size: 20, alpha: f2, sp: 1, color: '#ff9a7a' }); }
      const e = win(p, 0.9, 1.02, 0.04); if (e > 0.01) T(g, 'AND WEBB ISN’T DONE', W / 2, H * 0.52, { size: A.portrait ? 62 : 96, weight: 800, align: 'center', alpha: e, glow: 32, glowColor: '#ff7a4a', sp: 3 });
    },
  };

  // ---------------- OUTRO ----------------
  sc.outro = {
    title: null,
    build() {},
    update(p) {
      const pl = plane(app); this.active = [pl.scene, pl.camera]; setPlaneCam(pl, app, 0, 0, lerp(1.7, 2.1, p));
      const u = pl.field.uniforms; u.uHubble.value = 0; u.uColorMode.value = 0; u.uReveal.value = 1; u.uRedden.value = 0; u.uBright.value = 1.0; u.uOnlyMiri.value = 0; u.uSizeMul.value = 1; pl.sp.material.uniforms.uBright.value = 1;
      return base({ bloom: 1.1, exposure: 1.25, thr: 0.7 });
    },
    hud(g, p) {
      const W = app.W, H = app.H, s = S(); const a = smooth(0.05, 0.25, p);
      g.fillStyle = `rgba(0,0,10,${0.55 * a})`; g.fillRect(0, 0, W, H);
      T(g, 'A HUNDRED HOURS OF NOTHING —', W / 2, H * 0.36, { size: A.portrait ? 40 : 64, weight: 800, align: 'center', alpha: a, sp: 2 }); T(g, 'AND THE NOTHING WAS FULL.', W / 2, H * 0.36 + (A.portrait ? 60 : 84) * s, { size: A.portrait ? 40 : 64, weight: 800, align: 'center', alpha: a, sp: 2, color: '#9fc4ff', glow: 24, glowColor: '#6fa8ff' });
      const b = smooth(0.3, 0.5, p); T(g, 'WHAT SHOULD WEBB LOOK AT NEXT?  TELL US BELOW.', W / 2, H * 0.58, { size: A.portrait ? 26 : 36, weight: 600, align: 'center', alpha: b, sp: 3 });
      const c = smooth(0.45, 0.65, p); panel(g, W / 2 - 330 * s, H * 0.64, 660 * s, 90 * s, 0.7 * c, 'rgba(255,90,90,.8)'); T(g, 'SUBSCRIBE · TECHNICAL TALK INDIA', W / 2, H * 0.64 + 58 * s, { size: 32, weight: 800, align: 'center', alpha: c, sp: 3 });
      const d = smooth(0.6, 0.85, p); T(g, 'Data & science: ESA/Webb · NASA · CSA · STScI · MIDIS & JADES collaborations', W / 2, H * 0.9, { size: 20, align: 'center', alpha: d * 0.8, color: '#9fb4d8', sp: 1 }); T(g, 'Visuals are a procedural simulation inspired by published results — not actual Webb imagery.', W / 2, H * 0.9 + 30 * s, { size: 20, align: 'center', alpha: d * 0.8, color: '#9fb4d8', sp: 1 });
    },
  };

  Object.values(sc).forEach((o) => { const u = o.update, h = o.hud, b = o.build; o.update = function (p, a, t) { A = app; return u.call(this, p, a, t); }; o.hud = function (g, p, t) { A = app; return h.call(this, g, p, t); }; o._build = b; });
  return sc;
}
export { T, measure, rrect, wrapText };
export const setApp = (a) => { A = a; };
