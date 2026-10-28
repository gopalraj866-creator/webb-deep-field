// Deterministic frame renderer: Three.js (WebGL2 via SwiftShader) -> JPEG frames -> ffmpeg (H.264).
// Usage:
//   node scripts/render.mjs --target 1080p --from 0 --to 30 --out build/seg_1080p_00.mp4
//   node scripts/render.mjs --target still --scene exposure --p 0.7 --w 1280 --h 720 --out preview.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : a), []));
const TARGETS = { '4k': [3840, 2160, 'main'], '1080p': [1920, 1080, 'main'], 'shorts': [1080, 1920, 'short'], 'still': [+args.w || 1280, +args.h || 720, args.mode || 'main'] };
const [W, H, mode] = TARGETS[args.target || '1080p'];
const FPS = +(args.fps || 30);

// ---- estimated captions (used when build/captions_*.json from the TTS step is absent) ----
function estimateCaptions(which) {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/script.json'), 'utf8'));
  const caps = []; let start = 0;
  const durs = which === 'short' ? [10, 8, 22, 10, 8] : [30, 55, 65, 45, 40, 60, 80, 65, 45, 40, 15];
  script[which].forEach((sc, i) => { let t = start + 0.6; sc.lines.forEach((l) => { const d = Math.max(1.6, l.split(/\s+/).length / 2.5); caps.push({ start: t, end: t + d, text: l }); t += d + 0.25; }); start += durs[i]; });
  return caps;
}
function loadCaptions() {
  const f = path.join(ROOT, `build/captions_${mode}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  return estimateCaptions(mode);
}

// ---- static server ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); let f;
  if (u === '/') f = path.join(ROOT, 'src/index.html');
  else if (u.startsWith('/three/')) f = path.join(ROOT, 'node_modules/three', u.slice(7));
  else if (u.startsWith('/fonts/')) f = path.join(ROOT, 'node_modules/@fontsource/inter/files', u.slice(7));
  else f = path.join(ROOT, 'src', u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;

// ---- browser ----
const puppeteer = require('puppeteer-core');
let exe = process.env.CHROME_PATH, chromiumArgs = [];
if (!exe) { const chromium = require('@sparticuz/chromium'); exe = await chromium.executablePath(); chromiumArgs = chromium.args; }
const browser = await puppeteer.launch({ executablePath: exe, headless: 'shell', protocolTimeout: 0,
  args: [...chromiumArgs, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', `--window-size=${W},${H}`] });
const page = await browser.newPage(); await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERR', e.message)); page.on('console', (m) => { const t = m.text(); if (/error|warn/i.test(m.type()) || /ERROR/.test(t)) console.error('BROWSER', t.slice(0, 400)); });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
const info = await page.evaluate(`window.__init(${JSON.stringify({ w: W, h: H, mode, caps: loadCaptions() })})`);
console.log('init', info);

if (args.target === 'still') {
  const t = +(args.t || 0); const opts = { scene: args.scene, p: args.p !== undefined ? +args.p : undefined, noHud: args.nohud === 'true', thumb: args.thumb === 'true' };
  if (args.scene) opts.scene = args.scene;
  await page.evaluate(`window.__frame(${t}, ${JSON.stringify(opts)})`);
  const b64 = await page.evaluate('window.__png()'); fs.writeFileSync(args.out || 'still.png', Buffer.from(b64, 'base64'));
  await browser.close(); server.close(); process.exit(0);
}

const meta = await page.evaluate('window.__meta()'); const total = mode === 'short' ? meta.short : meta.main;
const from = +(args.from ?? 0), to = Math.min(+(args.to ?? total), total);
const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
const out = args.out || `build/out_${args.target}.mp4`; fs.mkdirSync(path.dirname(out), { recursive: true });
const crf = args.crf || (args.target === '4k' ? '17' : '16'); const preset = args.preset || 'medium';
let FFMPEG = process.env.FFMPEG; if (!FFMPEG) { try { FFMPEG = require('ffmpeg-static'); } catch { FFMPEG = 'ffmpeg'; } }
const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((r) => ff.on('close', r));
const t0 = Date.now();
for (let f = f0; f < f1; f++) {
  const t = f / FPS; await page.evaluate(`window.__frame(${t})`);
  const b64 = await page.evaluate('window.__jpeg(0.96)'); const buf = Buffer.from(b64, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - f0) % 30 === 0) { const el = (Date.now() - t0) / 1000; const n = f - f0 + 1; console.log(`frame ${f - f0 + 1}/${f1 - f0}  ${(el / n).toFixed(2)} s/frame  ETA ${(((f1 - f0 - n) * el) / n / 60).toFixed(1)} min`); }
}
ff.stdin.end(); await done; await browser.close(); server.close();
console.log('wrote', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
