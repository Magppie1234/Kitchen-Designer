import '../ui/geometry.js';
// lib/shareApi.js — client share links (Stage 9.4/9.6), one handler for both servers.
//
//   POST /api/share { roomId, state, includeEstimate? } -> { url, token, expiresAt, revision }
//        Creating a share first freezes the CURRENT state as a 'share' revision (Stage 8.8),
//        then mints an expiring token pinned to that revision — later edits never change
//        what the client sees at the link.
//   GET  /api/share?token=... -> a self-contained read-only HTML page: room + series, the
//        2D plan and per-wall elevations (rendered server-side by lib/render.js — pure
//        SVG, no scripts), walkthrough snapshots, accessory list, and — when the share
//        includes it (a setting, Stage 9.5) — the estimate. If a newer revision exists the
//        page says so (Stage 9.6); the link can simply be reshared to pin the newer one.
import { createShare, getShare } from './designStore.js';
import { quoteConfig } from './pricingConfig.js';
import { getSeries } from './series.js';
import { readJsonBody } from './apiRuntime.js';
import { hasDb } from './db.js';
import { RULES } from './rules.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const html = (res, code, body) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(body); };
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

// Server-side SVG of the LIVE plan shape (runs[].segments with x0/x1 + tiers), drawn from
// the shared revision's state. (lib/render.js predates this shape — it was written for the
// retired planMagppie run format — so the share page draws directly.)
const KCOL = { cabinet: '#cdb89a', anchorHob: '#c4794f', anchorSink: '#6c98b8', tall: '#a9906c', corner: '#b08968', filler: '#e8dcc4', kept: '#B4533A' };
function segFill(s) {
  if (s.kind === 'anchor') return s.label === 'hob' ? KCOL.anchorHob : s.label === 'sink' ? KCOL.anchorSink : KCOL.tall;
  if (s.kind === 'corner') return KCOL.corner;
  if (s.kind === 'tallBank') return KCOL.tall;
  if (s.kind === 'filler' || s.kind === 'inset') return KCOL.filler;
  return KCOL.cabinet;
}
export function livePlanSvg(state, width = 820, margin = 34) {
  const walls = state.walls || [], plan = state.plan;
  if (!walls.length || !plan || !plan.runs) return '';
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]), ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const s = (width - 2 * margin) / Math.max(1, maxx - minx);
  const height = Math.round((maxy - miny) * s + 2 * margin);
  const T = (p) => [Math.round(margin + (p[0] - minx) * s), Math.round(margin + (p[1] - miny) * s)];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif,system-ui,sans-serif">`
    + `<polygon points="${walls.map((w) => T(w.a).join(',')).join(' ')}" fill="#fbf8f3" stroke="#2b2b2b" stroke-width="3"/>`;
  for (const r of plan.runs) {
    const w = walls[+String(r.key).slice(1)]; if (!w) continue;
    const u = [(w.b[0] - w.a[0]) / (w.length || 1), (w.b[1] - w.a[1]) / (w.length || 1)];
    const n = KitchenGeometry.normal(w,walls);
    for (const seg of r.segments || []) {
      if (['door','window','gap','open'].includes(seg.kind)&&!seg.hiddenCorner) continue;
      const d = seg.depth??RULES.depths.base, x0 = seg.x0 || 0, offset=seg.offset??0;
      const p0 = [w.a[0] + u[0] * x0+n[0]*offset, w.a[1] + u[1] * x0+n[1]*offset];
      const p1 = [p0[0] + u[0] * seg.width, p0[1] + u[1] * seg.width];
      const pts = [p0, p1, [p1[0] + n[0] * d, p1[1] + n[1] * d], [p0[0] + n[0] * d, p0[1] + n[1] * d]].map(T);
      svg += `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${segFill(seg)}" stroke="#2b2b2b" stroke-width="0.8"${seg.kept ? ` stroke-dasharray="5 3" stroke="${KCOL.kept}" stroke-width="2"` : ''}/>`;
      if(seg.shutter){const front=at=>T([w.a[0]+u[0]*at+n[0]*(d+offset),w.a[1]+u[1]*at+n[1]*(d+offset)]),a=front(seg.shutter.x0),b=front(seg.shutter.x1);
        svg+=`<line data-blind-shutter="true" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#70551e" stroke-width="2"/>`;}
      if (seg.width >= 380) {
        const c = T([(p0[0] + p1[0]) / 2 + n[0] * d / 2, (p0[1] + p1[1]) / 2 + n[1] * d / 2]);
        svg += `<text x="${c[0]}" y="${c[1]}" font-size="9" fill="#3a342c" text-anchor="middle" dominant-baseline="middle">${seg.kind === 'anchor' ? esc(seg.label) : seg.width}</text>`;
      }
    }
  }
  const isl = plan.island;
  if (isl && isl.working) {
    const tot = isl.total || 1800, d = 900;
    const p = T([cx - tot / 2, cy - d / 2]);
    svg += `<rect x="${p[0]}" y="${p[1]}" width="${Math.round(tot * s)}" height="${Math.round(d * s)}" fill="${KCOL.cabinet}" stroke="#2b2b2b" stroke-width="1.2"/>`
      + `<text x="${T([cx, cy])[0]}" y="${T([cx, cy])[1]}" font-size="10" fill="#3a342c" text-anchor="middle">ISLAND ${tot}mm</text>`;
  }
  return svg + '</svg>';
}
export function liveElevSvg(state, width = 820) {
  const walls = state.walls || [], plan = state.plan;
  if (!walls.length || !plan || !plan.runs) return '';
  const H = { baseTop: 850, WB: plan.geometry?.wallBottom??1415, wallTop: 2500, loft: 3100, tall: 2400, ...(plan.geometry||{}) };
  const rowH = 170, gap = 34, margin = 30;
  const rows = plan.runs.filter((r) => (r.segments || []).length);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length * (rowH + gap) + margin}" font-family="ui-sans-serif,system-ui,sans-serif">`;
  rows.forEach((r, ri) => {
    const y0 = margin + ri * (rowH + gap), len = r.total || 1;
    const sx = (width - 2 * margin) / len, sy = rowH / 3100;
    const X = (mm) => Math.round(margin + mm * sx), Y = (h) => Math.round(y0 + rowH - h * sy);
    svg += `<text x="${margin}" y="${y0 - 6}" font-size="11" fill="#6b6155">Wall ${esc(r.key)} · ${Math.round(len)} mm</text>`
      + `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(len)}" y2="${Y(0)}" stroke="#2b2b2b" stroke-width="1.6"/>`;
    for (const seg of r.segments || []) {
      if (['door','window','gap','open'].includes(seg.kind)) continue;
      const tallish = seg.kind === 'tallBank' || (seg.kind === 'anchor' && ['fridge', 'oven', 'pantry', 'crockery'].includes(seg.label));
      const top = tallish || seg.tier==='tall' ? (seg.height??H.tall) : H.baseTop;
      svg += `<rect x="${X(seg.x0 || 0)}" y="${Y(top)}" width="${Math.max(2, Math.round(seg.width * sx))}" height="${Y(0) - Y(top)}" fill="${segFill(seg)}" stroke="#2b2b2b" stroke-width="0.7"/>`;
      if(seg.shutter)svg+=`<rect data-blind-shutter="true" x="${X(seg.shutter.x0)}" y="${Y(top)}" width="${seg.shutter.width*sx}" height="${Y(0)-Y(top)}" fill="#d8c9a3" stroke="#70551e"/>`;
    }
    const t = plan.tiers && plan.tiers[r.key];
    if (t) for (const [tier, hb, ht] of [['wall', H.WB, H.wallTop], ['loft', H.wallTop, H.loft]]) {
      for (const u2 of t[tier] || []) {
        if (!['wallSolid', 'wallGlass', 'wallBlind', 'loft', 'chimney'].includes(u2.kind)) continue;
        svg += `<rect x="${X(u2.x0 || 0)}" y="${Y((u2.z??hb)+(u2.height??ht-hb))}" width="${Math.max(2, Math.round(u2.width * sx))}" height="${Y(u2.z??hb) - Y((u2.z??hb)+(u2.height??ht-hb))}" fill="${u2.kind === 'chimney' ? '#7a6a55' : '#e3d7c4'}" stroke="#2b2b2b" stroke-width="0.6"/>`;
        if(u2.shutter)svg+=`<rect data-blind-shutter="true" x="${X(u2.shutter.x0)}" y="${Y((u2.z??hb)+(u2.height??ht-hb))}" width="${u2.shutter.width*sx}" height="${Y(u2.z??hb)-Y((u2.z??hb)+(u2.height??ht-hb))}" fill="#d8c9a3" stroke="#70551e"/>`;
      }
    }
  });
  return svg + '</svg>';
}

function sharePage(sh) {
  const st = sh.state || {};
  const series = getSeries(sh.seriesId);
  let plan2d = '', elevs = '';
  try { plan2d = livePlanSvg(st); elevs = liveElevSvg(st); } catch { /* drawing is best-effort */ }
  const snaps = (st.snapshots || []).map((s) => s.rendered || s.img).filter(Boolean);
  const acc = (st.plan && st.plan.accessories) || [];
  const price = st.plan && st.plan.price;
  const finishName = (st.options && st.options.lookName) || st.material || '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(sh.roomName)} — Magppie Kitchen</title>
<style>body{font-family:system-ui,sans-serif;background:#F4F1EB;color:#2A2722;margin:0;padding:32px 18px}
.wrap{max-width:880px;margin:0 auto}.card{background:#fff;border:1px solid #E4DFD3;border-radius:14px;padding:22px;margin-bottom:16px}
h1{font-size:26px;font-weight:500;margin:0 0 4px}h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#8A8579;margin:0 0 12px}
.meta{font-size:13px;color:#6B675E}.note{background:#FBF1EC;border:1px solid #E8C9BE;border-radius:10px;padding:10px 14px;font-size:13px;color:#B4533A;margin-bottom:16px}
img{max-width:100%;border-radius:10px;display:block;margin-bottom:10px}svg{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #EEE9DE;text-align:left}
.total{font-size:22px;font-weight:600}</style></head><body><div class="wrap">
<div class="card"><h1>${esc(sh.roomName)}</h1>
<div class="meta">${series ? esc(series.name) + ' series · ' : ''}${finishName ? esc(finishName) + ' finish · ' : ''}Revision ${sh.revisionNumber} · shared ${new Date(sh.createdAt).toLocaleDateString()} · link expires ${sh.expiresAt ? new Date(sh.expiresAt).toLocaleDateString() : 'never'}</div></div>
${sh.newerExists ? `<div class="note">A newer version of this design exists (revision ${sh.latestRevision}). This page shows revision ${sh.revisionNumber} exactly as it was shared — ask your designer to reshare for the latest.</div>` : ''}
${snaps.length ? `<div class="card"><h2>Views</h2>${snaps.map((s) => `<img src="${s}" alt="kitchen view">`).join('')}</div>` : ''}
${plan2d ? `<div class="card"><h2>Floor plan</h2>${plan2d}</div>` : ''}
${elevs ? `<div class="card"><h2>Elevations</h2>${elevs}</div>` : ''}
${acc.length ? `<div class="card"><h2>Accessories</h2><table>${acc.map((a) => `<tr><td>${esc(a.name)}</td><td>×${a.qty || 1}</td></tr>`).join('')}</table></div>` : ''}
${sh.includeEstimate && price ? `<div class="card"><h2>Estimate</h2>
<table><tr><td>Cabinets (${price.shutterSqft} sqft shutter · ${esc(series?.finishLabel || price.finish)})</td><td style="text-align:right">${inr(price.breakdown.cabinets)}</td></tr>
<tr><td>Countertop (${price.counterSqft} sqft)</td><td style="text-align:right">${inr(price.breakdown.counter)}</td></tr>
<tr><td class="total">Estimate</td><td class="total" style="text-align:right">${inr(price.breakdown.total)}</td></tr></table>
<div class="meta" style="margin-top:8px">Indicative estimate before services, taxes and site specifics — the formal quotation follows.</div></div>` : ''}
<div class="meta" style="text-align:center;margin-top:20px">Magppie AI Kitchen Designer</div>
</div></body></html>`;
}

export async function handleShare(req, res) {
  try {
    if (!hasDb()) return json(res, 503, { error: 'Design store unavailable — shares need the local database.' });
    if (req.method === 'POST') {
      const b = await readJsonBody(req, 32 * 1024 * 1024);
      if (!b.roomId || !b.state) return json(res, 400, { error: 'POST {roomId, state, includeEstimate?}' });
      const qc = quoteConfig();
      const out = await createShare(b.roomId, b.state, {
        includeEstimate: b.includeEstimate ?? qc.shareIncludesEstimate,
        expiryDays: qc.shareExpiryDays,
      });
      return json(res, 200, { ...out, url: `/api/share?token=${out.token}` });
    }
    if (req.method === 'GET') {
      const token = new URL(req.url, 'http://x').searchParams.get('token');
      if (!token) return json(res, 400, { error: 'GET /api/share?token=...' });
      const sh = await getShare(token);
      if (!sh) return html(res, 404, '<h1 style="font-family:sans-serif">This share link does not exist.</h1>');
      if (sh.expired) return html(res, 410, '<h1 style="font-family:sans-serif">This share link has expired.</h1><p style="font-family:sans-serif">Ask your designer to share a fresh one.</p>');
      return html(res, 200, sharePage(sh));
    }
    return json(res, 405, { error: 'GET or POST /api/share.' });
  } catch (e) {
    return json(res, (e && e.status) || 500, { error: String((e && e.message) || e) });
  }
}
