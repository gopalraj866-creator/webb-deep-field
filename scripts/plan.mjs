// Builds the GitHub Actions render matrix: one job per (target, time-segment).
import fs from 'node:fs';
const targets = (process.env.TARGETS || '4k,1080p,shorts').split(',').map((s) => s.trim()).filter(Boolean);
const seg = Math.max(5, +(process.env.SEGMENT_SECONDS || 30));
const total = { '4k': 540, '1080p': 540, 'shorts': 58 };
const include = [];
for (const t of targets) {
  if (!total[t]) throw new Error('unknown target ' + t);
  const n = Math.ceil(total[t] / seg);
  for (let i = 0; i < n; i++) include.push({ target: t, idx: String(i).padStart(3, '0'), from: i * seg, to: Math.min(total[t], (i + 1) * seg) });
}
const out = `matrix=${JSON.stringify({ include })}\n`;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, out); else console.log(out);
console.log(`planned ${include.length} jobs`);
