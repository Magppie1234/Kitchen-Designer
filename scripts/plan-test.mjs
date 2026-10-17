// Read kitchen floor plans with gemini-3.8-flash and write a review page.
// Drop plans (png/jpg/webp/pdf) into plan-test/inputs/, then: node scripts/plan-test.mjs
// Two calls per plan: (1) find the kitchen on the sheet, (2) read a high-res crop of just the
// kitchen. Needs python + pymupdf (scripts/plan-crop.py). Output: plan-test/out/, report.html.
// A plan already read (its JSON is in out/) is not sent again: delete that JSON to re-read it.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LOCATE, READ, MODEL, ask } from '../plan-read.mjs';   // the app's own prompts and Gemini call

try { process.loadEnvFile(); } catch {}
const INR_PER_USD = 88; // ponytail: fixed rate, only for the estimate shown in the report
// USD per 1M tokens, standard paid tier (ai.google.dev/gemini-api/docs/pricing, Oct 2026; doubles 1 Jan 2027)
const PRICE = { in: 0.75, out: 3.75 };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const DIR = 'plan-test', IN = join(DIR, 'inputs'), OUT = join(DIR, 'out');
const CROP = join(import.meta.dirname, 'plan-crop.py');

async function run(file) {
  const src = join(IN, file), mime = MIME[extname(file).toLowerCase()], t0 = Date.now();
  const doc = mime === 'application/pdf'
    ? { type: 'document', mime_type: mime, data: readFileSync(src).toString('base64') }
    : { type: 'image', mime_type: mime, data: readFileSync(src).toString('base64'), resolution: 'high' };
  const loc = await ask([{ type: 'text', text: LOCATE }, doc]);
  const k = loc.json?.kitchens?.[0], page = +k?.page || 1, box = k?.box_2d;
  const crop = join(OUT, 'crops', `${file}.png`);
  execFileSync('python', [CROP, src, crop, String(page), ...(Array.isArray(box) && box.length === 4 ? box.map(String) : [])]);
  const rd = await ask([{ type: 'text', text: READ },
    { type: 'image', mime_type: 'image/png', data: readFileSync(crop).toString('base64'), resolution: 'ultra_high' }]);
  const tin = loc.tokens.in + rd.tokens.in, tout = loc.tokens.out + rd.tokens.out;
  const usd = (tin * PRICE.in + tout * PRICE.out) / 1e6;
  return { model: MODEL, file, seconds: (Date.now() - t0) / 1000, page, box, crop: crop.slice(DIR.length + 1).replaceAll('\\', '/'),
    tokens: { in: tin, out: tout }, usd, inr: usd * INR_PER_USD, result: rd.json, raw: rd.json ? undefined : rd.text };
}

// Walk the outline and draw it; estimated numbers in orange so they're easy to distrust.
export function sketch(res) {
  const step = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
  const segsIn = res?.outline || [];
  if (!segsIn.length) return '<p>No outline returned.</p>';
  let x = 0, y = 0; const segs = [];
  for (const w of segsIn) {
    const [dx, dy] = step[w.dir] || [0, 0], L = +w.length_mm || 0;
    segs.push({ w, x, y, dx, dy, L }); x += dx * L; y += dy * L;
  }
  const xs = segs.flatMap((s) => [s.x, s.x + s.dx * s.L]), ys = segs.flatMap((s) => [s.y, s.y + s.dy * s.L]);
  const minX = Math.min(...xs), minY = Math.min(...ys), span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const k = 300 / span, P = (v, m) => ((v - m) * k + 40).toFixed(1);
  const stroke = { wall: '#222', partition: '#666', glass: '#29f', open: '#bbb' };
  const num = (o, v) => `<tspan fill="${o.source === 'estimated' ? '#e70' : '#060'}">${v}</tspan>`;
  let svg = '';
  for (const s of segs) {
    const x2 = s.x + s.dx * s.L, y2 = s.y + s.dy * s.L;
    svg += `<line x1="${P(s.x, minX)}" y1="${P(s.y, minY)}" x2="${P(x2, minX)}" y2="${P(y2, minY)}" stroke="${stroke[s.w.kind] || '#222'}" stroke-width="3"${s.w.kind === 'open' ? ' stroke-dasharray="6 4"' : ''}/>`;
    svg += `<text x="${P((s.x + x2) / 2, minX)}" y="${P((s.y + y2) / 2, minY)}" font-size="11" dx="${s.dy ? 6 : 0}" dy="${s.dx ? -6 : 0}">${s.w.id} ${num(s.w, s.L)}</text>`;
    for (const o of (res.openings || []).filter((o) => o.segment === s.w.id)) {
      const a = +o.offset_mm || 0, b = a + (+o.width_mm || 0);
      svg += `<line x1="${P(s.x + s.dx * a, minX)}" y1="${P(s.y + s.dy * a, minY)}" x2="${P(s.x + s.dx * b, minX)}" y2="${P(s.y + s.dy * b, minY)}" stroke="${{ door: '#d33', window: '#29f' }[o.type] || '#f90'}" stroke-width="7"/>`;
    }
    for (const f of (res.fixtures || []).filter((f) => f.segment === s.w.id)) {
      const a = +f.offset_mm || 0;
      svg += `<circle cx="${P(s.x + s.dx * a, minX)}" cy="${P(s.y + s.dy * a, minY)}" r="5" fill="#a0a"/><text x="${P(s.x + s.dx * a, minX)}" y="${P(s.y + s.dy * a, minY)}" dx="7" dy="14" font-size="10" fill="#a0a">${f.type}</text>`;
    }
  }
  const gap = Math.round(Math.hypot(x, y));
  return `<svg viewBox="0 0 380 380" width="380" height="380" style="background:#fafafa;border:1px solid #ddd">${svg}</svg>${gap > 50 ? `<p style="color:#d33">Outline doesn't close: ends ${gap} mm from the start.</p>` : ''}`;
}

// How much of the answer is backed by numbers on the drawing.
export function sourcing(res) {
  const all = [...(res?.outline || []), ...(res?.openings || []), ...(res?.fixtures || [])];
  const n = (s) => all.filter((v) => v.source === s).length;
  return `${n('printed')} printed · ${n('derived')} derived · <span style="color:#e70">${n('estimated')} estimated</span>`;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

if (process.argv[1] && basename(process.argv[1]) === 'plan-test.mjs') {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY missing (.env)');
  mkdirSync(IN, { recursive: true });
  const files = readdirSync(IN).filter((f) => MIME[extname(f).toLowerCase()]);
  if (!files.length) { console.log(`Put plan files in ${IN}/ and run again.`); process.exit(0); }
  mkdirSync(join(OUT, 'crops'), { recursive: true });
  const all = [];
  for (const file of files) {
    const saved = join(OUT, `${file}.json`);
    if (existsSync(saved)) { all.push(JSON.parse(readFileSync(saved, 'utf8'))); console.log(`${file}: already read, ₹0`); continue; }
    process.stdout.write(`${file} … `);
    let r;
    try { r = await run(file); } catch (e) { r = { model: MODEL, file, error: e?.error?.message || e.message, inr: 0 }; }
    if (!r.error) writeFileSync(saved, JSON.stringify(r, null, 2)); // a failed plan is retried next run
    console.log(r.error ? `ERROR ${r.error}` : `₹${r.inr.toFixed(2)}, ${r.seconds}s, page ${r.page}`);
    all.push(r);
  }
  const rows = files.map((file) => {
    const src = `inputs/${encodeURI(file)}`;
    const view = extname(file).toLowerCase() === '.pdf' ? `<embed src="${src}" width="420" height="420">` : `<img src="${src}" style="max-width:420px">`;
    const cols = all.filter((r) => r.file === file).map((r) => `<td>${r.error ? `<p style="color:#d33">${esc(r.error)}</p>` : `
      <p>₹${r.inr.toFixed(2)} · ${r.seconds}s · ${r.tokens.in} in / ${r.tokens.out} out tokens</p>
      <p><b>Layout:</b> ${esc(r.result?.layout ?? '—')} · <b>confidence</b> ${r.result?.confidence ?? '—'} · ${sourcing(r.result)}</p>
      ${sketch(r.result)}
      <p><b>Fixtures:</b> ${esc((r.result?.fixtures || []).map((f) => `${f.type}${f.segment ? '@' + f.segment : ''}`).join(', ') || '—')}</p>
      <p><b>Unreadable:</b> ${esc((r.result?.unreadable || []).join('; ') || '—')}</p>
      <p><b>Notes:</b> ${esc(r.result?.notes ?? '')}</p>
      <details><summary>Crop the model read</summary><img src="${encodeURI(r.crop)}" style="max-width:420px"></details>
      <details><summary>Full JSON</summary><pre>${esc(JSON.stringify(r.result ?? r.raw, null, 2))}</pre></details>`}</td>`).join('');
    return `<tr><td><h3>${esc(file)}</h3>${view}</td>${cols}</tr>`;
  }).join('');
  const total = all.reduce((n, r) => n + r.inr, 0);
  writeFileSync(join(DIR, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Plan reading</title>
<style>body{font:14px system-ui;margin:16px}td{vertical-align:top;padding:8px;border-bottom:1px solid #ccc}pre{max-width:420px;overflow:auto;font-size:11px}</style>
<h1>Plan reading · ${MODEL}</h1><p>${files.length} plans · total ≈ ₹${total.toFixed(2)}.
Sketch: black = wall, grey dashed = open side, blue line = glass, red = door, blue bar = window, purple = fixtures.
Green numbers are printed or derived from the drawing; <span style="color:#e70">orange numbers are estimates</span>.</p><table>${rows}</table>`);
  console.log(`\nTotal ≈ ₹${total.toFixed(2)}. Open ${join(DIR, 'report.html')}`);
}
