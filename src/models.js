import * as THREE from 'three';

function strut(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

// Stylised James Webb Space Telescope. Units ~ metres. Mirror faces +Z, sunshield is the XZ plane below it.
export function buildWebb() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.5, roughness: 0.6 });
  const R = 0.762; const sh = new THREE.Shape();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; k ? sh.lineTo(Math.cos(a) * R, Math.sin(a) * R) : sh.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
  const hexGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false });
  const pos = [];
  for (let k = 0; k < 6; k++) {
    const a1 = (30 + 60 * k) * Math.PI / 180, a2 = (60 * k) * Math.PI / 180;
    pos.push([Math.cos(a1) * 1.32, Math.sin(a1) * 1.32]);
    pos.push([Math.cos(a1) * 2.64, Math.sin(a1) * 2.64]);
    pos.push([Math.cos(a2) * 2.286, Math.sin(a2) * 2.286]);
  }
  const mirror = new THREE.Group(); const segs = [];
  pos.forEach(([x, y]) => {
    const m = new THREE.Mesh(hexGeo, gold); const d = Math.hypot(x, y);
    m.position.set(x, y, d * d / (2 * 15.88)); m.rotation.set(-y / 15.88, x / 15.88, 0); mirror.add(m); segs.push(m);
  });
  const back = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.2, 0.7), dark); back.position.z = -0.5; mirror.add(back);
  const p0 = new THREE.Vector3(0, 0.3, 7.2);
  [new THREE.Vector3(0, 3.5, 0.2), new THREE.Vector3(-3.0, -1.8, 0.2), new THREE.Vector3(3.0, -1.8, 0.2)].forEach((a) => mirror.add(strut(a, p0, 0.07, dark)));
  const sec = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), gold); sec.position.copy(p0); sec.rotation.x = -Math.PI / 2; mirror.add(sec);
  mirror.position.set(0, 2.4, 0); g.add(mirror);
  // sunshield: 5 kite-shaped layers
  const kite = new THREE.Shape(); kite.moveTo(-10.6, 0); kite.lineTo(0, -6.2); kite.lineTo(10.6, 0); kite.lineTo(0, 8.0); kite.closePath();
  const kGeo = new THREE.ExtrudeGeometry(kite, { depth: 0.015, bevelEnabled: false });
  const shMat = new THREE.MeshStandardMaterial({ color: 0xbfb2f5, metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide });
  const layers = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(kGeo, shMat); m.rotation.x = -Math.PI / 2; m.position.set(0, -1.5 - i * 0.42, 1.0); g.add(m); layers.push(m); }
  // bus
  const bus = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 3.4), new THREE.MeshStandardMaterial({ color: 0xcaa24a, metalness: 0.8, roughness: 0.45 })); bus.position.set(0, -4.7, 0.5); g.add(bus);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 2.2), new THREE.MeshStandardMaterial({ color: 0x1a2a55, metalness: 0.4, roughness: 0.4 })); panel.position.set(0, -4.7, -3.0); g.add(panel);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 })); dish.position.set(1.9, -3.1, 1.0); g.add(dish);
  g.userData = { segs, mirror, layers };
  return g;
}

export function buildHubble() {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.7, roughness: 0.3 });
  const goldFoil = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.5, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 8.2, 48), silver); body.rotation.x = Math.PI / 2; g.add(body);
  const aft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.4, 48), goldFoil); aft.rotation.x = Math.PI / 2; aft.position.z = -5.6; g.add(aft);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 4.4, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })); shield.rotation.x = Math.PI / 2; shield.position.z = 6.2; g.add(shield);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 40), dark); inner.rotation.x = Math.PI / 2; inner.position.z = 4.2; g.add(inner);
  const door = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 3.0), silver); door.position.set(0, 3.7, 9.2); door.rotation.x = -0.9; g.add(door);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const c = cv.getContext('2d'); c.fillStyle = '#0d2a6e'; c.fillRect(0, 0, 256, 512); c.strokeStyle = '#6f93e8'; c.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); } for (let y = 0; y <= 512; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const solar = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.4 });
  [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 7.2), solar); p.position.set(s * 4.6, 0, -1); g.add(p); g.add(strut(new THREE.Vector3(s * 2.1, 0, -1), new THREE.Vector3(s * 3.3, 0, -1), 0.1, dark)); });
  [-1, 1].forEach((s) => { const a = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), silver); a.position.set(s * 1.4, 2.4, -2.2); a.rotation.x = -0.6; g.add(a); g.add(strut(new THREE.Vector3(s * 1.4, 2.0, -2.2), new THREE.Vector3(s * 1.4, 2.4, -2.2), 0.05, dark)); });
  return g;
}

const NOISE = `
float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }`;

export function buildMoon() {
  return new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({
    uniforms: { uL: { value: new THREE.Vector3(0.6, 0.35, 0.7).normalize() } },
    vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + `uniform vec3 uL; varying vec3 vP; varying vec3 vN;
    void main(){ vec3 p=normalize(vP); float f=fbm(p*3.2); float f2=fbm(p*14.);
      float maria = smoothstep(.48,.58,fbm(p*1.7+3.)); float cr = smoothstep(.55,.9,f2);
      float alb = mix(.62,.30,maria) + (f-.5)*.25 - cr*.08;
      float d = clamp(dot(vN,uL),0.,1.); d = pow(d,.8);
      gl_FragColor=vec4(vec3(alb)*vec3(1.,.98,.94)*(d*1.5+.02),1.); }` }));
}

export function buildEarth() {
  const g = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), new THREE.ShaderMaterial({
    uniforms: { uL: { value: new THREE.Vector3(0.7, 0.45, 0.5).normalize() }, uT: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP=position; vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + `uniform vec3 uL; uniform float uT; varying vec3 vP; varying vec3 vN; varying vec3 vW;
    void main(){ vec3 p=normalize(vP); float land=smoothstep(.5,.54,fbm(p*2.6+1.7));
      float ice=smoothstep(.9,.98,abs(p.y));
      vec3 ocean=mix(vec3(.01,.06,.2),vec3(.03,.2,.45),fbm(p*8.)); vec3 ground=mix(vec3(.12,.28,.1),vec3(.45,.38,.2),fbm(p*5.+4.));
      vec3 col=mix(ocean,ground,land); col=mix(col,vec3(.9),ice);
      float cl=smoothstep(.55,.8,fbm(p*3.4+vec3(uT,0.,uT*.5))); col=mix(col,vec3(1.),cl*.6);
      float d=clamp(dot(vN,uL),0.,1.);
      vec3 V=normalize(cameraPosition-vW); float fr=pow(1.-clamp(dot(normalize(vN),V),0.,1.),3.);
      vec3 lit=col*(d*1.25+.015)+vec3(.15,.4,1.)*fr*(d*.9+.1);
      float spec=pow(clamp(dot(reflect(-uL,vN),V),0.,1.),40.)*(1.-land)*.6*d;
      gl_FragColor=vec4(lit+spec,1.); }` }));
  g.add(earth);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.025, 128, 96), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uL: { value: new THREE.Vector3(0.7, 0.45, 0.5).normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uL; varying vec3 vN; varying vec3 vW; void main(){ vec3 V=normalize(cameraPosition-vW); float a=pow(clamp(dot(-vN,V),0.,1.),2.2); gl_FragColor=vec4(vec3(.25,.55,1.)*a*(.35+.9*clamp(dot(-vN,uL)+.4,0.,1.)),1.); }` }));
  g.add(atm); g.userData.earth = earth; return g;
}
