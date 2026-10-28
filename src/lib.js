import * as THREE from 'three';

// ---------- math helpers ----------
export const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const win = (p, a, b, f = 0.03) => smooth(a, a + f, p) * (1 - smooth(b - f, b, p));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ---------- galaxy catalogue (one shared deep field, deterministic) ----------
export function buildCatalog(N = 14000, seed = 11) {
  const r = rng(seed);
  const c = { n: N, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), flux: new Float32Array(N), size: new Float32Array(N),
    q: new Float32Array(N), rot: new Float32Array(N), type: new Float32Array(N), seed: new Float32Array(N), col: new Float32Array(N * 3),
    cat: new Uint8Array(N), miri: new Uint8Array(N), hub: new Uint8Array(N), order: new Float32Array(N) };
  const score = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    c.x[i] = (r() * 2 - 1) * 1.85; c.y[i] = (r() * 2 - 1) * 1.05;
    const u = r();
    let z = u < 0.015 ? 6 + r() * 8.4 : u < 0.06 ? 3 + r() * 3 : -Math.log(1 - r()) * 1.1 + 0.1;
    c.z[i] = Math.min(z, 14.4);
    const f = Math.pow(r(), 3.2);
    let flux = 0.02 + f * 1.5;
    flux /= 1 + 0.03 * z * z;
    c.size[i] = (0.004 + 0.032 * Math.pow(f, 0.9)) / (1 + 0.12 * z) + 0.0022;
    c.q[i] = 0.35 + r() * 0.65; c.rot[i] = r() * Math.PI; c.seed[i] = r();
    const tr = r();
    c.type[i] = z < 2 ? (tr < 0.35 ? 1 : tr < 0.6 ? 0 : 2) : z < 5 ? (tr < 0.3 ? 1 : 2) : 2;
    let cat = 0;
    if (z > 5.5) cat = 2; else if (z > 0.8 && r() < 0.09) cat = 1;
    c.cat[i] = cat;
    let cr, cg, cb;
    if (cat === 1) { cr = 1.0; cg = 0.42 + r() * 0.15; cb = 0.15 + r() * 0.1; flux *= 1.7; }
    else if (cat === 2) { cr = 0.62; cg = 1.0; cb = 0.78; flux *= 1.6; }
    else { const t = Math.pow(r(), 2); if (c.type[i] === 0) { cr = 1; cg = 0.86; cb = 0.62; } else { cr = lerp(0.5, 1, t); cg = lerp(0.74, 0.93, t); cb = lerp(1, 0.78, t); } }
    c.col[i * 3] = cr; c.col[i * 3 + 1] = cg; c.col[i * 3 + 2] = cb;
    c.flux[i] = flux;
    score[i] = flux * (cat === 1 ? 3 : cat === 2 ? 2 : 1) * (0.5 + r());
    c.order[i] = r();
  }
  const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => score[b] - score[a]);
  for (let k = 0; k < Math.min(2500, N); k++) c.miri[idx[k]] = 1;
  for (let i = 0; i < N; i++) c.hub[i] = (c.cat[i] !== 2 && !(c.cat[i] === 1 && c.flux[i] < 0.5)) ? 1 : 0;
  return c;
}
export const DIST = (z) => 70 * Math.log(1 + z) + 4;
export function cosmicAge(z) { // Gyr, standard LCDM table
  const T = [[0, 13.8], [1, 5.9], [2, 3.3], [3, 2.2], [4, 1.5], [6, 0.94], [8, 0.64], [10, 0.47], [12, 0.37], [14.32, 0.29], [15, 0.27]];
  for (let i = 0; i < T.length - 1; i++) if (z <= T[i + 1][0]) { const t = (z - T[i][0]) / (T[i + 1][0] - T[i][0]); return Math.exp(lerp(Math.log(T[i][1]), Math.log(T[i + 1][1]), t)); }
  return 0.27;
}

// ---------- instanced galaxy sprites ----------
const GAL_VS = `
attribute vec3 aOffset; attribute vec4 aShape; attribute vec4 aCol; attribute float aSize; attribute vec4 aFlags;
uniform float uSizeMul, uReveal, uHubble, uOnlyMiri, uRedden, uNear;
varying vec2 vUv; varying vec4 vShape; varying vec4 vCol; varying float vVis;
void main(){
  float fade = smoothstep(aFlags.x, aFlags.x + 0.04, uReveal);
  float vis = fade;
  if(uHubble > .5) vis *= aFlags.y;
  if(uOnlyMiri > .5) vis *= aFlags.z;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  if(uNear > 0.5){ vis *= smoothstep(8.0, 40.0, -mv.z); }
  mv.xy += position.xy * aSize * uSizeMul * step(0.001, vis);
  vUv = position.xy; vShape = aShape; vCol = aCol; vVis = vis;
  if(uRedden > 0.0){
    float t = smoothstep(1.5, 9.0, aFlags.w) * uRedden;
    float l = dot(aCol.rgb, vec3(.3,.5,.2));
    vCol.rgb = mix(aCol.rgb, vec3(1.0,.42,.18) * l * 1.25, t);
  }
  gl_Position = projectionMatrix * mv;
}`;
const GAL_FS = `
uniform float uBright, uColorMode;
varying vec2 vUv; varying vec4 vShape; varying vec4 vCol; varying float vVis;
float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  if(vVis < .001) discard;
  vec2 p = vUv; float c = cos(vShape.y), s = sin(vShape.y);
  p = vec2(c*p.x + s*p.y, -s*p.x + c*p.y); p.y /= vShape.x;
  float r = length(p); if(r > 1.0) discard;
  float th = atan(p.y, p.x); float type = vShape.z; float sd = vShape.w;
  float I;
  if(type < .5){ I = exp(-7.0*pow(r,.35)) * 1.6 + exp(-22.0*r)*1.2; }
  else if(type < 1.5){
    float arm = .62 + .38*cos(2.0*th + 8.0*log(r+.06) + sd*6.283);
    I = exp(-4.6*r) * mix(1.0, arm, smoothstep(.12,.5,r)) + exp(-18.0*r)*1.4;
  } else {
    float n = vn(p*7.0 + sd*40.0)*.75 + vn(p*15.0 + sd*9.0)*.45;
    I = exp(-4.0*r) * (.35 + n) + exp(-16.0*r)*.7;
  }
  I *= 1.0 - smoothstep(.62, 1.0, r);
  vec3 col = vCol.rgb;
  if(uColorMode > .5 && uColorMode < 1.5){ float l = dot(col, vec3(.3,.5,.2)); col = mix(vec3(l), col, .45) * vec3(1.0,.96,.88); }
  if(uColorMode > 1.5){ col = vec3(dot(col, vec3(.3,.5,.2))); }
  gl_FragColor = vec4(col * I * vCol.a * uBright, 1.0);
}`;

export class GalaxyField {
  constructor(cat, { cone = false, filter = null, sizeScale = 1, coneW = 0.42, zMax = 14.4 } = {}) {
    const idx = []; for (let i = 0; i < cat.n; i++) if (!filter || filter(cat, i)) idx.push(i);
    const n = idx.length;
    const off = new Float32Array(n * 3), shape = new Float32Array(n * 4), col = new Float32Array(n * 4), size = new Float32Array(n), flags = new Float32Array(n * 4);
    idx.forEach((i, k) => {
      let zf = cat.z[i];
      if (cone) { zf = Math.exp(lerp(Math.log(1.05), Math.log(zMax + 1.05), cat.order[i])) - 1; const d = DIST(zf); off.set([cat.x[i] * d * coneW, cat.y[i] * d * coneW, -d], k * 3); size[k] = cat.size[i] * d * 0.5 * sizeScale / (1 + 0.08 * zf); }
      else { off.set([cat.x[i], cat.y[i], 0], k * 3); size[k] = cat.size[i] * sizeScale; }
      shape.set([cat.q[i], cat.rot[i], cat.type[i], cat.seed[i]], k * 4);
      col.set([cat.col[i * 3], cat.col[i * 3 + 1], cat.col[i * 3 + 2], cat.flux[i]], k * 4);
      flags.set([cat.order[i], cat.hub[i], cat.miri[i], zf], k * 4);
    });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 4));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    g.setAttribute('aFlags', new THREE.InstancedBufferAttribute(flags, 4));
    g.instanceCount = n;
    this.uniforms = { uSizeMul: { value: 1 }, uReveal: { value: 1 }, uHubble: { value: 0 }, uOnlyMiri: { value: 0 }, uRedden: { value: 0 }, uNear: { value: 0 }, uBright: { value: 1 }, uColorMode: { value: 0 } };
    const m = new THREE.ShaderMaterial({ vertexShader: GAL_VS, fragmentShader: GAL_FS, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.count = n; this.idx = idx;
  }
}

// ---------- stars (point sprites + diffraction-spike sprites) ----------
export function makeStars(n, radius, seed = 3, hole = null) {
  const r = rng(seed); const pos = new Float32Array(n * 3), sz = new Float32Array(n), br = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v; do { v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.05);
    v.normalize();
    if (hole && v.angleTo(hole.dir) < hole.ang) { i--; continue; }
    v.multiplyScalar(radius); pos.set([v.x, v.y, v.z], i * 3);
    const b = Math.pow(r(), 4); sz[i] = 1.2 + b * 3.2; br[i] = 0.25 + b * 1.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aBr', new THREE.BufferAttribute(br, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1 }, uBright: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize, aBr; uniform float uPx; varying float vB; void main(){ vB=aBr; gl_PointSize=aSize*uPx; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uBright; varying float vB; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=exp(-d*d*3.5)*smoothstep(1.,.8,d); gl_FragColor=vec4(vec3(.78,.86,1.)*a*vB*uBright,1.); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}

const SPIKE_VS = `attribute vec3 aOffset; attribute float aSize; attribute float aBr; varying vec2 vUv; varying float vB;
void main(){ vec4 mv = modelViewMatrix*vec4(aOffset,1.); mv.xy += position.xy*aSize; vUv=position.xy; vB=aBr; gl_Position=projectionMatrix*mv; }`;
const SPIKE_FS = `varying vec2 vUv; varying float vB; uniform float uBright;
float sp(vec2 p, float a, float len, float th){ vec2 d=vec2(cos(a),sin(a)); float al=abs(dot(p,d)); float pe=abs(dot(p,vec2(-d.y,d.x))); return exp(-pe*th)*exp(-al*len)/(1.+al*6.); }
void main(){ float r=length(vUv); if(r>1.) discard;
  float core = exp(-r*r*900.)*3. + exp(-r*r*120.)*.7 + exp(-r*18.)*.12;
  float s = sp(vUv,1.5708,3.2,70.)+sp(vUv,.5236,3.2,70.)+sp(vUv,2.618,3.2,70.)+.35*sp(vUv,0.,4.5,90.);
  float a = (core + s*.9) * smoothstep(1.,.6,r) * vB * uBright;
  gl_FragColor=vec4(vec3(1.,.93,.82)*a,1.); }`;
export function makeSpikeStars(list) { // list of {p:[x,y,z], size, br}
  const n = list.length; const off = new Float32Array(n * 3), sz = new Float32Array(n), br = new Float32Array(n);
  list.forEach((s, i) => { off.set(s.p, i * 3); sz[i] = s.size; br[i] = s.br; });
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aSize', new THREE.InstancedBufferAttribute(sz, 1)); g.setAttribute('aBr', new THREE.InstancedBufferAttribute(br, 1));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({ vertexShader: SPIKE_VS, fragmentShader: SPIKE_FS, uniforms: { uBright: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}

// ---------- full-screen post pipeline ----------
const FS_VERT = `varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy,0.,1.); }`;
function fsMat(frag, uniforms) { return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }); }
const DOWN_FS = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
vec3 br(vec3 c){ float l=max(c.r,max(c.g,c.b)); return c*max(l-uThr,0.)/max(l,1e-4); }
void main(){ vec3 a = vec3(0.); vec2 t=uTexel;
 a += br(texture2D(tSrc,vUv+t*vec2(-1.5,-1.5)).rgb); a += br(texture2D(tSrc,vUv+t*vec2(1.5,-1.5)).rgb);
 a += br(texture2D(tSrc,vUv+t*vec2(-1.5,1.5)).rgb);  a += br(texture2D(tSrc,vUv+t*vec2(1.5,1.5)).rgb);
 a += br(texture2D(tSrc,vUv+t*vec2(-.5,-.5)).rgb)*1.; a += br(texture2D(tSrc,vUv+t*vec2(.5,.5)).rgb)*1.;
 a += br(texture2D(tSrc,vUv+t*vec2(-.5,.5)).rgb)*1.; a += br(texture2D(tSrc,vUv+t*vec2(.5,-.5)).rgb)*1.;
 gl_FragColor = vec4(a/8.,1.); }`;
const COPY_FS = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){ vec3 a=texture2D(tSrc,vUv+uTexel*vec2(-.5,-.5)).rgb+texture2D(tSrc,vUv+uTexel*vec2(.5,.5)).rgb+texture2D(tSrc,vUv+uTexel*vec2(-.5,.5)).rgb+texture2D(tSrc,vUv+uTexel*vec2(.5,-.5)).rgb; gl_FragColor=vec4(a*.25,1.); }`;
const BLUR_FS = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 a = texture2D(tSrc,vUv).rgb*.227;
 a += (texture2D(tSrc,vUv+uDir*1.385).rgb+texture2D(tSrc,vUv-uDir*1.385).rgb)*.3162;
 a += (texture2D(tSrc,vUv+uDir*3.231).rgb+texture2D(tSrc,vUv-uDir*3.231).rgb)*.0703;
 gl_FragColor=vec4(a,1.); }`;
const COMP_FS = `
uniform sampler2D tScene, tA, tB, tC, tOver; uniform vec2 uRes; uniform float uBloom, uExposure, uFade, uFlash, uGrain, uTime, uVig, uSeed;
uniform float uExpo, uGain, uBg, uStretch, uMono, uCell; uniform vec3 uTint;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
float gauss(vec2 p){ float u1=max(h21(p),1e-4), u2=h21(p+17.7); return sqrt(-2.*log(u1))*cos(6.2831853*u2); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 bl = texture2D(tA,vUv).rgb*.55 + texture2D(tB,vUv).rgb*.4 + texture2D(tC,vUv).rgb*.55;
  vec3 outc;
  if(uExpo >= 0.0){
    vec2 cell = floor(vUv*uRes/uCell);
    float e = max(uExpo, 1e-4);
    vec3 truth = c*0.35 + vec3(uBg);
    vec3 mean = truth*uGain*e;
    vec3 n = vec3(gauss(cell+uSeed*3.1), gauss(cell*1.37+11.3+uSeed), gauss(cell*.73+29.1+uSeed*2.0));
    float nl = gauss(cell+5.5+uSeed);
    n = mix(n, vec3(nl), .55);
    vec3 obs = mean + n*sqrt(mean + 25.0);
    vec3 est = obs/(uGain*e) - vec3(uBg);
    vec3 v = asinh(max(est,0.)*uStretch)/asinh(uStretch);
    float l = dot(v, vec3(.3,.5,.2));
    v = mix(vec3(l)*uTint, v, 1.0-uMono);
    outc = pow(clamp(v + bl*.35*uBloom*sqrt(e),0.,1.), vec3(1./1.0));
    outc = pow(outc, vec3(1.0));
  } else {
    c += bl*uBloom;
    outc = pow(aces(c*uExposure), vec3(1./2.2));
  }
  vec2 q = vUv-.5; float vg = 1.0 - uVig*dot(q,q)*1.6; outc *= vg;
  outc += (h21(vUv*uRes + uTime*37.0)-.5)*uGrain;
  vec4 o = texture2D(tOver, vUv);
  outc = outc*(1.-o.a) + o.rgb;
  outc = mix(outc, vec3(1.), uFlash);
  outc *= (1.-uFade);
  gl_FragColor = vec4(clamp(outc,0.,1.),1.);
}`;

export class Post {
  constructor(renderer, W, H, samples = 4) {
    this.r = renderer; this.W = W; this.H = H;
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { ...opt, samples });
    this.rtScenePlain = new THREE.WebGLRenderTarget(W, H, { ...opt, samples: 0 });
    const mk = (d) => new THREE.WebGLRenderTarget(Math.max(2, Math.ceil(W / d)), Math.max(2, Math.ceil(H / d)), { ...opt, depthBuffer: false });
    this.A = mk(4); this.A2 = mk(4); this.B = mk(8); this.B2 = mk(8); this.C = mk(16); this.C2 = mk(16);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, null); this.quad.frustumCulled = false; this.scn = new THREE.Scene(); this.scn.add(this.quad);
    this.mDown = fsMat(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.9 } });
    this.mCopy = fsMat(COPY_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mBlur = fsMat(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.overCanvas = document.createElement('canvas'); this.overCanvas.width = W; this.overCanvas.height = H;
    this.over = new THREE.CanvasTexture(this.overCanvas); this.over.flipY = true; this.over.premultiplyAlpha = true; this.over.minFilter = THREE.LinearFilter; this.over.generateMipmaps = false;
    this.mComp = fsMat(COMP_FS, {
      tScene: { value: null }, tA: { value: this.A.texture }, tB: { value: this.B.texture }, tC: { value: this.C.texture }, tOver: { value: this.over },
      uRes: { value: new THREE.Vector2(W, H) }, uBloom: { value: 1 }, uExposure: { value: 1 }, uFade: { value: 0 }, uFlash: { value: 0 }, uGrain: { value: 0.025 }, uTime: { value: 0 }, uVig: { value: 0.5 }, uSeed: { value: 0 },
      uExpo: { value: -1 }, uGain: { value: 4000 }, uBg: { value: 0.05 }, uStretch: { value: 40 }, uMono: { value: 0 }, uCell: { value: 2 }, uTint: { value: new THREE.Vector3(1, .82, .62) } });
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scn, this.cam); }
  blur(rt, tmp) {
    const m = this.mBlur; m.uniforms.tSrc.value = rt.texture; m.uniforms.uDir.value.set(1 / rt.width, 0); this.pass(m, tmp);
    m.uniforms.tSrc.value = tmp.texture; m.uniforms.uDir.value.set(0, 1 / rt.height); this.pass(m, rt);
  }
  render(scene, camera, P) {
    const r = this.r; const rt = P.mesh ? this.rtScene : this.rtScenePlain;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, camera);
    const sc = P.S || 1;
    if (P.bloom > 0) {
      this.mDown.uniforms.tSrc.value = rt.texture; this.mDown.uniforms.uTexel.value.set(1 / this.W, 1 / this.H); this.mDown.uniforms.uThr.value = P.thr ?? 0.9; this.pass(this.mDown, this.A);
      this.blur(this.A, this.A2);
      this.mCopy.uniforms.tSrc.value = this.A.texture; this.mCopy.uniforms.uTexel.value.set(1 / this.A.width, 1 / this.A.height); this.pass(this.mCopy, this.B);
      this.blur(this.B, this.B2);
      this.mCopy.uniforms.tSrc.value = this.B.texture; this.mCopy.uniforms.uTexel.value.set(1 / this.B.width, 1 / this.B.height); this.pass(this.mCopy, this.C);
      this.blur(this.C, this.C2);
    }
    const u = this.mComp.uniforms; u.tScene.value = rt.texture; u.uBloom.value = P.bloom; u.uExposure.value = P.exposure; u.uFade.value = P.fade; u.uFlash.value = P.flash; u.uTime.value = P.time % 7;
    u.uExpo.value = P.expo; u.uGain.value = P.gain; u.uBg.value = P.bg; u.uStretch.value = P.stretch; u.uMono.value = P.mono; u.uCell.value = Math.max(1, Math.round(2 * sc)); u.uSeed.value = P.seed || 0; u.uVig.value = P.vig; u.uGrain.value = P.grain;
    this.over.needsUpdate = true;
    this.pass(this.mComp, null);
  }
}
