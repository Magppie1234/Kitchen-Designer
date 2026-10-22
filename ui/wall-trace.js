// Traces a kitchen's boundary off a raster plan from ONE wall the designer marks (A -> B).
// The marked stroke teaches how THIS drawing draws a wall: solid, or two face lines of a given
// weight with a given fill between them (hollow / hatched), its thickness and its ink colour
// (a CAD export often draws walls in their own colour). A wall
// elsewhere is ink whose cross-section looks like that and carries on for a wall's length, so
// counter edges, zone lines, dimension lines, furniture and text are ignored. Along the traced
// outline, a stretch that does not look like that wall is a door (nothing drawn across) or a
// window (something else drawn across); a side with almost no wall is open; solid blocks in or
// against the wall are columns. No DOM, no server (tested under node: test/wall-trace).
(function (root) {
  // Square (2r+1)² min/max filter on a 0/1 mask via running sums; axes 'h', 'v' or both.
  function morph(src, w, h, r, erode, axes = 'hv') {
    if (r <= 0) return src.slice();
    const pass = (inp, horiz) => {
      const out = new Uint8Array(w * h), n = horiz ? w : h, lines = horiz ? h : w, pre = new Int32Array(n + 1);
      for (let l = 0; l < lines; l++) {
        const base = horiz ? l * w : l, step = horiz ? 1 : w;
        for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + inp[base + i * step];
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, i - r), b = Math.min(n, i + r + 1), s = pre[b] - pre[a];
          out[base + i * step] = erode ? +(s === b - a) : +(s > 0);
        }
      }
      return out;
    };
    let m = src;
    if (axes.includes('h')) m = pass(m, true);
    if (axes.includes('v')) m = pass(m, false);
    return m;
  }
  const close = (m, w, h, r, axes) => morph(morph(m, w, h, r, false, axes), w, h, r, true, axes);
  const open = (m, w, h, r) => morph(morph(m, w, h, r, true), w, h, r, false);

  function otsu(gray) {
    const hist = new Float64Array(256); for (const v of gray) hist[v]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sumB = 0, best = -1, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = gray.length - wB; if (!wF) break;
      sumB += i * hist[i];
      const v = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  function paperLevel(gray) {
    const hist = new Uint32Array(256); for (const v of gray) hist[v]++;
    let p = 255; for (let i = 0; i < 256; i++) if (hist[i] > hist[p]) p = i;
    return p;
  }

  // 4-connected fill of the free space around (sx,sy); null once it reaches the image edge (a leak).
  function fill(barrier, w, h, sx, sy) {
    const reg = new Uint8Array(w * h), s0 = sy * w + sx, stack = [s0];
    reg[s0] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return null;
      for (const q of [p - 1, p + 1, p - w, p + w]) if (!reg[q] && !barrier[q]) { reg[q] = 1; stack.push(q); }
    }
    return reg;
  }
  function freeNear(barrier, w, h, x, y, maxR) {
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const X = x + dx, Y = y + dy;
        if (X > 0 && Y > 0 && X < w - 1 && Y < h - 1 && !barrier[Y * w + X]) return [X, Y];
      }
    return null;
  }

  // Outer boundary of a pixel region as a closed loop of grid vertices.
  function boundary(reg, w, h) {
    const W = w + 1, next = new Map(), add = (a, b) => { (next.get(a) || next.set(a, []).get(a)).push(b); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!reg[y * w + x]) continue;
      const k = y * W + x;
      if (!reg[(y - 1) * w + x]) add(k, k + 1);
      if (!reg[y * w + x + 1]) add(k + 1, k + 1 + W);
      if (!reg[(y + 1) * w + x]) add(k + 1 + W, k + W);
      if (!reg[y * w + x - 1]) add(k + W, k);
    }
    let best = null, bestA = 0;
    for (const start of next.keys()) {
      const loop = [];
      for (let k = start, outs; (outs = next.get(k)) && outs.length;) { loop.push(k); k = outs.pop(); }
      if (loop.length < 4) continue;
      const pts = loop.map(k => [k % W, Math.floor(k / W)]), a = Math.abs(area(pts));
      if (a > bestA) { bestA = a; best = pts; }
    }
    return best;
  }
  const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
  function inside(x, y, p) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    return c;
  }

  function dp(pts, tol) {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let iMax = 0, dMax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
      if (d > dMax) { dMax = d; iMax = i; }
    }
    return dMax <= tol ? [a, b] : [...dp(pts.slice(0, iMax + 1), tol).slice(0, -1), ...dp(pts.slice(iMax), tol)];
  }

  // Simplified loop -> axis-aligned polygon. Each run of near-horizontal edges becomes one wall at
  // its length-weighted MEDIAN y (vertical likewise); runs shorter than minJog are dropped.
  // ponytail: axis-aligned walls only; a plan drawn at an angle needs a rotate-to-stroke step first.
  function orthogonalize(loop, minJog) {
    const n = loop.length;
    let g = [];
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (!len) continue;
      const h = Math.abs(dx) >= Math.abs(dy), part = [h ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2, len];
      const last = g[g.length - 1];
      if (last && last.h === h) last.parts.push(part); else g.push({ h, parts: [part] });
    }
    const len = x => x.parts.reduce((s, p) => s + p[1], 0);
    if (g.length > 1 && g[0].h === g[g.length - 1].h) g[0].parts.push(...g.pop().parts);
    while (g.length > 4) {
      let i = 0; g.forEach((x, k) => { if (len(x) < len(g[i])) i = k; });
      if (len(g[i]) >= minJog) break;
      const m = g.length, p = g[(i - 1 + m) % m], q = g[(i + 1) % m];
      p.parts.push(...q.parts);
      g = g.filter(x => x !== g[i] && x !== q);
    }
    if (g.length < 4 || g.length % 2) return null;
    const c = g.map(x => {
      const ps = [...x.parts].sort((a, b) => a[0] - b[0]), half = len(x) / 2;
      let acc = 0; for (const [v, l] of ps) if ((acc += l) >= half) return v;
      return ps[ps.length - 1][0];
    });
    return g.map((x, i) => { const j = (i + 1) % g.length; return x.h ? [c[j], c[i]] : [c[i], c[j]]; });
  }

  const at = (gray, w, h, x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= w || y >= h ? 255 : gray[y * w + x]; };
  const isInk = (m, w, h, x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1; };
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  // Ink runs [start, end) on the segment p + dir*k, k = 0..len-1, of a 0/1 ink mask.
  function runsOn(m, w, h, p, dir, len) {
    const runs = [];
    for (let k = 0, s = -1; k <= len; k++) {
      const d = k < len && isInk(m, w, h, p[0] + dir[0] * k, p[1] + dir[1] * k);
      if (d && s < 0) s = k; else if (!d && s >= 0) { runs.push([s, k]); s = -1; }
    }
    return runs;
  }
  const inked = (runs, len) => runs.reduce((a, r) => a + r[1] - r[0], 0) / len;

  // Pixels drawn in the wall's ink: on the paper -> wall-colour line, at least halfway to the wall
  // colour and not far off it, so a red wall's anti-aliased edge counts and a black cabinet line
  // beside it does not. For a black-on-white plan this is plain "darker than mid-grey".
  function inkMask(rgb, w, h, c, paper) {
    const v = [c[0] - paper, c[1] - paper, c[2] - paper], L2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2 || 1, m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) {
      const d0 = rgb[3 * i] - paper, d1 = rgb[3 * i + 1] - paper, d2 = rgb[3 * i + 2] - paper;
      const t = (d0 * v[0] + d1 * v[1] + d2 * v[2]) / L2;
      if (t < 0.5) continue;
      const e0 = d0 - t * v[0], e1 = d1 - t * v[1], e2 = d2 - t * v[2];
      if (e0 * e0 + e1 * e1 + e2 * e2 <= 0.35 * 0.35 * L2) m[i] = 1;
    }
    return m;
  }
  const grayRgb = gray => { const rgb = new Uint8Array(gray.length * 3); for (let i = 0; i < gray.length; i++) rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = gray[i]; return rgb; };

  // Learn the wall style under the stroke a -> b. pxPerMm is provisional (stroke length / typed mm).
  // rgb (w*h*3) is optional; without it the plan is read in grey.
  // -> {a, b, u, n, lo, hi, T, len, runs, frac, solid, faceW, fin, fill, hatch, ink, any, rgb} or
  // null when no wall runs under the stroke. ink: 0/1 mask of this wall's ink colour; any: any ink.
  // fill / hatch: share and mean colour of ANY ink between the faces (hatching drawn in another
  // colour is still part of how the wall is drawn).
  function learn({ gray, rgb, w, h, a, b, pxPerMm }) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 10) return null;
    rgb = rgb || grayRgb(gray);
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
    const R = Math.round(500 * pxPerMm) + 4, paper = paperLevel(gray), thr0 = Math.max(otsu(gray), paper - 40);
    const N = Math.max(20, Math.min(400, Math.round(L / 2)));
    const ts = Array.from({ length: N }, (_, i) => L * (0.05 + 0.9 * i / (N - 1)));
    const pt = (t, d) => [a[0] + u[0] * t + n[0] * d, a[1] + u[1] * t + n[1] * d];
    // share of the stroke's length that is inked at each perpendicular offset: a wall's lines
    // run the whole way (high share), text and hatching only in places
    const frac = new Float64Array(2 * R + 1);
    for (const t of ts) for (let d = -R; d <= R; d++) { const p = pt(t, d); if (at(gray, w, h, p[0], p[1]) <= thr0) frac[d + R] += 1 / N; }
    const bands = [];
    for (let d = -R; d <= R; d++) if (frac[d + R] >= 0.5) {
      const last = bands[bands.length - 1];
      if (last && last.hi === d - 1) last.hi = d; else bands.push({ lo: d, hi: d });
    }
    if (!bands.length) return null;
    // the wall's faces: the lines either side of the stroke (it is drawn along the wall), or the
    // line under it: alone if thick enough to be a solid wall, else with its nearest neighbour.
    // Never more than two, so a dimension line running beside a wall is not taken into it.
    const gapMax = 350 * pxPerMm, gap = (p, q) => (p.lo > q.hi ? p.lo - q.hi : q.lo - p.hi);
    const pair = B => {
      if (B.hi - B.lo + 1 >= Math.max(3, 60 * pxPerMm)) return [B];
      const nb = bands.filter(x => x !== B && gap(x, B) <= gapMax).sort((p, q) => gap(p, B) - gap(q, B))[0];
      return nb ? [B, nb] : [B];
    };
    const on = bands.find(x => x.lo <= 0 && x.hi >= 0), below = bands.filter(x => x.hi < 0).pop(), above = bands.find(x => x.lo > 0);
    const dist = x => Math.min(Math.abs(x.lo), Math.abs(x.hi));
    const faces = on ? pair(on)
      : below && above && above.lo - below.hi <= gapMax ? [below, above]
        : pair([below, above].filter(Boolean).sort((p, q) => dist(p) - dist(q))[0]);
    const lo = Math.min(...faces.map(f => f.lo)), hi = Math.max(...faces.map(f => f.hi));
    // the wall's ink colour: the average of its face pixels
    const sum = [0, 0, 0]; let cnt = 0;
    for (const t of ts) for (const f of faces) for (let d = f.lo; d <= f.hi; d++) {
      const p = pt(t, d), x = Math.round(p[0]), y = Math.round(p[1]);
      if (x < 0 || y < 0 || x >= w || y >= h || gray[y * w + x] > thr0) continue;
      for (let c = 0; c < 3; c++) sum[c] += rgb[3 * (y * w + x) + c];
      cnt++;
    }
    if (!cnt) return null;
    const ink = inkMask(rgb, w, h, sum.map(v => v / cnt), paper), any = new Uint8Array(w * h);
    for (let i = 0; i < any.length; i++) any[i] = gray[i] <= thr0 ? 1 : 0;
    const T = hi - lo + 1, len = T + 2;
    const sections = ts.map(t => runsOn(ink, w, h, pt(t, lo - 1), n, len));
    const runs = median(sections.map(r => r.length)), fr = median(sections.map(r => inked(r, len)));
    // face line weight, and how much of the space between the faces is inked (0 = hollow)
    const two = sections.filter(r => r.length >= 2);
    const faceW = two.length ? median(two.map(r => (r[0][1] - r[0][0] + r[r.length - 1][1] - r[r.length - 1][0]) / 2)) : T;
    const fin = two.length ? median(two.map(r => { const g = r[r.length - 1][0] - r[0][1]; return g > 0 ? inked(r.slice(1, -1), g) : 0; })) : 1;
    const t = { a, b, u, n, lo, hi, T, len, runs, frac: fr, solid: runs <= 1 && fr >= 0.8, faceW, fin, ink, any, rgb, w, h };
    const fills = ts.map((s, i) => [s, sections[i]]).filter(([, r]) => r.length >= 2)
      .map(([s, r]) => between(t, pt(s, lo - 1), n, r[0][1], r[r.length - 1][0]));
    t.fill = fills.length ? median(fills.map(f => f.frac)) : 0;
    const hatched = fills.filter(f => f.color);
    t.hatch = t.fill >= 0.06 && hatched.length ? [0, 1, 2].map(c => hatched.reduce((a, f) => a + f.color[c], 0) / hatched.length) : null;
    return t;
  }

  // Any ink between offsets s and e on the ray p + dir*k: its share, and its mean colour.
  function between(t, p, dir, s, e) {
    let n = 0; const c = [0, 0, 0];
    for (let k = s; k < e; k++) {
      const x = Math.round(p[0] + dir[0] * k), y = Math.round(p[1] + dir[1] * k);
      if (x < 0 || y < 0 || x >= t.w || y >= t.h || !t.any[y * t.w + x]) continue;
      n++; for (let q = 0; q < 3; q++) c[q] += t.rgb[3 * (y * t.w + x) + q];
    }
    return { frac: e > s ? n / (e - s) : 0, color: n ? c.map(v => v / n) : null };
  }

  // Cross-sections that look like template t, scanned along rows (finds vertical walls) or columns
  // (horizontal walls): one solid run of about a wall's thickness, or two face lines of the
  // template's weight a wall's thickness apart with the template's kind of fill between them.
  // Thickness may differ from the marked wall (a 115 partition vs a 230 outer wall drawn alike).
  // Kept only where it carries on along the wall for minLen — a wall is long, a letter is not.
  // A run much longer than a face is a face with a line drawn into it (a cross wall meeting it):
  // its face is the end nearest the other face. Such a match only fills a break in a wall found
  // without it (weak = 1, plain = 2), so a block next to a stray line never makes a wall.
  function bands(dark, w, h, t, rows, minLen) {
    const out = new Uint8Array(w * h), lines = rows ? h : w, L = rows ? w : h;
    const at = rows ? (l, k) => l * w + k : (l, k) => k * w + l;
    // a solid wall may be well under half the marked one (a 115 partition beside a 230 wall)
    const Tmin = (t.solid ? 0.4 : 0.5) * t.T, Tmax = 2.2 * t.T, tol = Math.max(2, 0.6 * t.faceW), fw = Math.round(t.faceW);
    const face = r => r[1] - r[0] >= t.faceW - tol && r[1] - r[0] <= 2 * t.faceW + 2, long = r => r[1] - r[0] > 2 * t.faceW + 2;
    const mark = (l, s, e, v) => { for (let k = s; k < e; k++) { const q = at(l, k); if (out[q] < v) out[q] = v; } };
    for (let l = 0; l < lines; l++) {
      const runs = [];
      for (let k = 0, s = -1; k <= L; k++) {
        const d = k < L && dark[at(l, k)];
        if (d && s < 0) s = k; else if (!d && s >= 0) { runs.push([s, k]); s = -1; }
      }
      for (let i = 0; i < runs.length; i++) {
        if (t.solid) { const len = runs[i][1] - runs[i][0]; if (len >= Tmin && len <= Tmax) mark(l, runs[i][0], runs[i][1], 2); continue; }
        const left = face(runs[i]) ? runs[i][0] : long(runs[i]) ? runs[i][1] - fw : -1;
        if (left < 0) continue;
        for (let j = i + 1, inner = 0; j < runs.length && runs[j][0] - left <= Tmax; j++) {
          const right = face(runs[j]) ? runs[j][1] : long(runs[j]) ? runs[j][0] + fw : -1, span = right - left;
          if (right >= 0 && span >= Tmin && span <= Tmax && Math.abs(inner / (runs[j][0] - runs[i][1]) - t.fin) <= 0.25)
            mark(l, left, right, face(runs[i]) && face(runs[j]) ? 2 : 1);
          inner += runs[j][1] - runs[j][0];
        }
      }
    }
    // persistence along the wall (perpendicular to the scan). A short break is a line drawn across
    // the wall (a dimension tick, a dashed grid line, hatching over a covered face), not its end:
    // bridged, but not counted. A break of paper is bridged only for a solid wall, and only short:
    // in a line-drawn style, letters stacked down a word would chain into a "wall".
    const n = rows ? w : h, M = rows ? h : w, idx = rows ? (c, k) => k * w + c : (c, k) => c * w + k;
    const gap = t.solid ? Math.max(3, Math.round(0.25 * t.T)) : 3, inkGap = Math.max(3, Math.round(0.5 * t.T));
    const crossed = (c, a, b) => { let k = 0; for (let q = a; q < b; q++) k += t.any[idx(c, q)]; return 2 * k >= b - a; };
    for (let c = 0; c < n; c++) {
      const runs = [];
      for (let k = 0, s = -1, strong = 0; k <= M; k++) {
        const v = k < M ? out[idx(c, k)] : 0;
        if (v && s < 0) { s = k; strong = 0; }
        if (v === 2) strong++;
        if (!v && s >= 0) {
          const last = runs[runs.length - 1];
          if (last && (s - last[1] <= gap || (s - last[1] <= inkGap && crossed(c, last[1], s)))) { last[1] = k; last[2] += strong; } else runs.push([s, k, strong]);
          s = -1;
        }
      }
      for (const [s, e, strong] of runs) for (let q = s; q < e; q++) out[idx(c, q)] = strong >= minLen ? 1 : 0;
    }
    return out;
  }
  // Drop wall pieces that stand alone and are small (a chair back drawn as a double arc): walls
  // meet other walls. Pieces within r of each other count as one.
  function dropIsolated(m, w, h, r, minSide) {
    const d = morph(m, w, h, r, false), seen = new Uint8Array(w * h), out = m.slice();
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!d[s0] || seen[s0]) continue;
      const comp = [s0]; seen[s0] = 1;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let k = 0; k < comp.length; k++) {
        const p = comp[k], x = p % w, y = (p - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < w * h && d[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
      }
      if (x1 - x0 < minSide && y1 - y0 < minSide) for (const p of comp) out[p] = 0;
    }
    return out;
  }

  // -> {lines: wall bands in every marked style (vert / horz: the vertical and horizontal walls
  // among them), wall: bands + solid blocks touching them (columns, filled junctions)}.
  function wallMasks(w, h, templates, px) {
    const lines = new Uint8Array(w * h), vert = new Uint8Array(w * h), horz = new Uint8Array(w * h), thick = new Uint8Array(w * h);
    for (const t of templates) {
      for (const rows of [true, false]) {
        const b = bands(t.ink, w, h, t, rows, px(300)), m = rows ? vert : horz;
        for (let i = 0; i < b.length; i++) if (b[i]) { lines[i] = 1; m[i] = 1; }
      }
      const o = open(t.ink, w, h, Math.ceil(0.35 * t.T)); for (let i = 0; i < o.length; i++) if (o[i]) thick[i] = 1;
    }
    let wall = lines.slice();
    const near = morph(lines, w, h, 2, false), stack = [];
    for (let i = 0; i < wall.length; i++) if (thick[i] && near[i] && !wall[i]) { wall[i] = 1; stack.push(i); }
    while (stack.length) {
      const p = stack.pop(), x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < wall.length && thick[q] && !wall[q]) { wall[q] = 1; stack.push(q); }
    }
    // after the solid blocks join in: a wall piece beyond a column still meets the rest through it
    wall = dropIsolated(wall, w, h, Math.ceil(templates[0].T / 2), px(600));
    for (let i = 0; i < lines.length; i++) { lines[i] &= wall[i]; vert[i] &= wall[i]; horz[i] &= wall[i]; }
    return { lines, vert, horz, wall };
  }

  // Small rectangular bumps into the room (<= maxPx each way) are columns: cut them out of the
  // outline and return them separately. Mid-wall bumps and corner steps both count.
  function takeColumns(poly, maxPx, minPx) {
    const cols = [], E = (p, i) => { const a = p[i % p.length], b = p[(i + 1) % p.length]; return [b[0] - a[0], b[1] - a[1]]; };
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0], L = v => Math.hypot(v[0], v[1]);
    const ok = v => L(v) <= maxPx && L(v) >= minPx;
    for (let changed = true; changed && poly.length > 4;) {
      changed = false;
      const n = poly.length;
      for (let i = 0; i < n && !changed; i++) {
        const p = E(poly, i + n - 1), q1 = E(poly, i), c = E(poly, i + 1), q2 = E(poly, i + 2), nx = E(poly, i + 3);
        // mid-wall: in, across, back out, and the wall carries on in line
        if (n >= 8 && cross(p, q1) > 0 && cross(q1, c) < 0 && cross(c, q2) < 0 && cross(q2, nx) > 0
          && ok(q1) && ok(c) && Math.abs(L(q1) - L(q2)) <= 0.2 * L(q1)) {
          const ids = [0, 1, 2, 3].map(k => (i + k) % n);
          cols.push(box(ids.map(k => poly[k])));
          poly = poly.filter((_, k) => !ids.includes(k));
          changed = true;
        } else if (cross(p, q1) > 0 && cross(q1, c) < 0 && cross(c, q2) > 0 && ok(q1) && ok(c) && n >= 6) {
          // corner: a step of two short sides where the corner should be
          const A = poly[i], C = poly[(i + 2) % n], horiz = Math.abs(p[0]) >= Math.abs(p[1]);
          const corner = horiz ? [C[0], A[1]] : [A[0], C[1]];
          cols.push(box([A, poly[(i + 1) % n], C, corner]));
          const ids = [i, (i + 1) % n, (i + 2) % n];
          const out = []; poly.forEach((v, k) => { if (k === ids[0]) out.push(corner); else if (!ids.includes(k)) out.push(v); });
          poly = out; changed = true;
        }
      }
    }
    return { poly, cols };
  }
  const box = pts => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };

  // A cross-section starting at a wall face (runs relative to the face): does it read as template
  // t — one solid run of a wall's thickness, or two face lines a wall's thickness apart with the
  // template's number of lines and kind of fill between them? The same test bands() uses, held
  // tighter on the fill, so a window drawn between the two faces does not pass.
  function wallSection(runs, t, p, dir) {
    const r0 = runs[0], T = t.T;
    if (t.solid) return r0[1] - r0[0] >= 0.4 * T && r0[1] - r0[0] <= 2.2 * T;
    const tol = Math.max(2, 0.6 * t.faceW), face = r => r[1] - r[0] >= t.faceW - tol && r[1] - r[0] <= 2 * t.faceW + 2;
    if (!face(r0)) return false;
    for (let j = 1, inner = 0; j < runs.length && runs[j][1] - r0[0] <= 2.2 * T; j++) {
      if (runs[j][1] - r0[0] >= 0.5 * T && face(runs[j]) && Math.abs(j - 1 - (t.runs - 2)) <= (t.runs > 2 ? 1 : 0)
        && Math.abs(inner / (runs[j][0] - r0[1]) - t.fin) <= 0.15) {
        // the fill must look like the wall's too: hatch where the wall is hatched (in its colour),
        // empty where it is hollow. Glass lines in place of the hatch are a window.
        const f = between(t, p, dir, r0[1], runs[j][0]);
        if (t.hatch ? f.frac >= 0.4 * t.fill && f.color && Math.hypot(f.color[0] - t.hatch[0], f.color[1] - t.hatch[1], f.color[2] - t.hatch[2]) <= 100
          : f.frac <= t.fill + 0.1) return true;
      }
      inner += runs[j][1] - runs[j][0];
    }
    return false;
  }

  // Walk each side just outside the room and sort every point: wall (W — the cross-section reads
  // as the marked wall, or is solid: a column or a cross wall), something else drawn across (X —
  // a window) or nothing within reach (E — a door or opening). Majority-smooth, then read off
  // openings, open sides, and solid blocks standing proud of the wall face (columns too shallow to
  // bend the outline). reach: how far off the outline a wall face may sit (jogs under minJog).
  function readSides(w, h, poly, templates, px, cols) {
    const t0 = templates[0], edges = [], openings = [], flush = [], reach = px(120) + 3;
    const span = Math.round(2.4 * Math.max(...templates.map(t => t.T))) + reach;
    poly.forEach((P, i) => {
      const Q = poly[(i + 1) % poly.length], L = Math.round(Math.hypot(Q[0] - P[0], Q[1] - P[1]));
      const u = [(Q[0] - P[0]) / (L || 1), (Q[1] - P[1]) / (L || 1)], o = [u[1], -u[0]];   // outward (clockwise outline)
      const raw = [], solid = [];
      for (let s = 0; s < L; s++) {
        const f = [P[0] + u[0] * (s + 0.5), P[1] + u[1] * (s + 0.5)], pt = k => [f[0] + o[0] * k, f[1] + o[1] * k];
        if (cols.some(b => f[0] >= b.x0 - 3 && f[0] <= b.x1 + 3 && f[1] >= b.y0 - 3 && f[1] <= b.y1 + 3)) { raw.push('W'); solid.push(false); continue; }
        let c = 'E', sol = false;
        for (const t of templates) {
          const start = pt(-1), col = runsOn(t.ink, w, h, start, o, span), k = col.findIndex(r => r[0] <= reach);
          const a0 = runsOn(t.any, w, h, start, o, span).find(r => r[0] <= reach);
          if (k < 0 && !a0) continue;
          let ok = false;
          // any wall-ink run starting within reach may be the face (a speck of a line drawn in front
          // of the wall can come out in the wall's colour)
          for (let j = k; j >= 0 && j < col.length && col[j][0] <= reach && !ok; j++) {
            const r0 = col[j];
            if (!t.solid && r0[1] - r0[0] >= 0.5 * t.T) { ok = true; sol = r0[0] <= 4; break; }   // solid block in a line-drawn wall
            ok = wallSection(col.slice(j), t, start, o);
          }
          // the inner face hidden under a line drawn over it (a cabinet's outline on the wall face):
          // the first ink at the face stands in for it, as long as the far face is the wall's own
          if (!ok && a0 && !t.solid && (k < 0 || a0[0] < col[k][0] - 3))
            ok = wallSection([[a0[0], Math.min(a0[1], a0[0] + Math.round(2 * t.faceW + 2))], ...col.filter(r => r[0] >= a0[1])], t, start, o);
          if (ok) { c = 'W'; break; }
          c = 'X';
        }
        raw.push(c); solid.push(sol);
      }
      const end = Math.min(t0.T + 2, L >> 2); for (let s = 0; s < end; s++) { raw[s] = 'W'; raw[L - 1 - s] = 'W'; }
      const half = Math.max(1, px(50)), cls = raw.map((_, s) => {
        const n = { W: 0, E: 0, X: 0 };
        for (let k = Math.max(0, s - half); k <= Math.min(L - 1, s + half); k++) n[raw[k]]++;
        return n.W >= n.E && n.W >= n.X ? 'W' : n.E >= n.X ? 'E' : 'X';
      });
      const segs = [];
      for (let s = 0; s < L;) { let e = s; while (e < L && (cls[e] === 'W') === (cls[s] === 'W')) e++; segs.push({ s, e, wall: cls[s] === 'W' }); s = e; }
      const minOpen = px(400), gaps = segs.filter(g => !g.wall && g.e - g.s >= minOpen);
      const cover = L ? 1 - gaps.reduce((a, g) => a + g.e - g.s, 0) / L : 0, isOpen = cover < 0.35;
      edges.push({ kind: isOpen ? 'open' : 'wall', cover });
      if (isOpen) return;
      for (const g of gaps) {
        let x = 0; for (let s = g.s; s < g.e; s++) if (cls[s] === 'X') x++;
        const type = x > (g.e - g.s) / 2 ? 'window' : 'door';
        openings.push({ edge: i, s: g.s, e: g.e, type, ...(type === 'door' && g.e - g.s > px(1500) ? { variant: 'doorless' } : {}) });
      }
      // solid stretches of a line-drawn wall that also stand into the room: a column
      for (let s = 0; s < L;) {
        if (!solid[s]) { s++; continue; }
        let e = s; while (e < L && solid[e]) e++;
        if (e - s >= px(150) && e - s <= px(1200)) {
          const depth = median([0.25, 0.5, 0.75].map(q => {
            const f = [P[0] + u[0] * (s + (e - s) * q), P[1] + u[1] * (s + (e - s) * q)];
            let d = 0; while (d < px(900) && isInk(t0.ink, w, h, f[0] - o[0] * (d + 0.5), f[1] - o[1] * (d + 0.5))) d++;
            return d;
          }));
          if (depth >= px(30)) {
            const A = [P[0] + u[0] * s, P[1] + u[1] * s], B = [P[0] + u[0] * e, P[1] + u[1] * e];
            flush.push(box([A, B, [A[0] - o[0] * depth, A[1] - o[1] * depth], [B[0] - o[0] * depth, B[1] - o[1] * depth]]));
          }
        }
        s = e;
      }
    });
    return { edges, openings, flush };
  }

  // templates: learn() results (the first one's stroke picks the room). prefer: [x,y] px the room
  // should contain when both sides of the stroke close (the kitchen box centre). limit: optional
  // {x0,y0,x1,y1} px — the kitchen box, a last-resort fence for a kitchen open to the next room.
  // -> {rooms: [{poly, cols, edges, openings}, ...] best first} or {error}.
  function trace({ w, h, templates, pxPerMm, prefer, limit }) {
    const px = mm => Math.max(1, Math.round(mm * pxPerMm)), t0 = templates[0];
    const { lines, vert, horz, wall } = wallMasks(w, h, templates, px);
    // Doorway and window gaps are bridged straight across (along rows / columns), never on a
    // slant, so a bridge cannot cut a corner or tie a wall to a column across the room. Up to
    // 1.6 m any two wall pieces in line are joined (a door beside a corner meets the cross wall);
    // a wider opening is joined only between pieces of the SAME wall line, so a narrow room is
    // never bridged shut; a kitchen open on a whole side closes only against its box.
    const cache = {};
    const barrier = g => cache[g] || (cache[g] = (() => {
      const out = wall.slice(), line = g === 'line' || g === 'box';
      const r = Math.round(px(line ? 3000 : g) / 2), a = close(line ? horz : lines, w, h, r, 'h'), b = close(line ? vert : lines, w, h, r, 'v');
      for (let i = 0; i < out.length; i++) if (a[i] || b[i]) out[i] = 1;
      return g === 'box' ? fence(out, w, h, limit) : out;
    })());
    const mid = [(t0.a[0] + t0.b[0]) / 2, (t0.a[1] + t0.b[1]) / 2], off = px(150);
    const seeds = [t0.hi + off, t0.lo - off].map(d => [mid[0] + t0.n[0] * d, mid[1] + t0.n[1] * d]);
    const found = [];
    for (const seed of seeds) for (const g of [1100, 1600, 'line', 'box']) {
      if (g === 'box' && !limit) break;
      const B = barrier(g), s = freeNear(B, w, h, seed[0], seed[1], px(300));
      const reg = s && fill(B, w, h, s[0], s[1]);
      if (!reg) continue;
      let cnt = 0; for (let i = 0; i < reg.length; i++) cnt += reg[i];
      if (cnt < px(800) ** 2) continue;
      found.push(reg); break;
    }
    if (!found.length) return { error: 'Could not close the room around that wall — try marking a different wall, or read it with AI.' };
    const rooms = found.map(reg => {
      const loop = boundary(reg, w, h); if (!loop) return null;
      let far = 0; loop.forEach((q, i) => { if (Math.hypot(q[0] - loop[0][0], q[1] - loop[0][1]) > Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])) far = i; });
      const simple = [...dp(loop.slice(0, far + 1), 1.5).slice(0, -1), ...dp([...loop.slice(far), loop[0]], 1.5).slice(0, -1)];
      // straightening twice drops the zero-length jogs equal medians can leave behind
      let poly = orthogonalize(simple, px(120)); if (!poly) return null;
      poly = orthogonalize(poly, px(120)) || poly;
      if (area(poly) < 0) poly.reverse();
      // a bump is a column only if it is drawn filled (solid, hatched, crossed); an outline-only bump
      // is a cabinet or fixture drawn against the wall, and the wall is just straightened past it
      const c = takeColumns(poly, px(900), px(100)), cols = c.cols.filter(b => inkIn(t0.ink, w, b) >= 0.35);
      poly = orthogonalize(c.poly, px(120)) || c.poly;   // the two sides of a cut-out bump rarely line up to the pixel
      const sides = readSides(w, h, poly, templates, px, cols);
      return { poly, cols: [...cols, ...sides.flush], edges: sides.edges, openings: sides.openings };
    }).filter(Boolean);
    if (!rooms.length) return { error: 'The traced outline did not come out as straight walls — try marking a different wall.' };
    if (rooms.length > 1) {
      const hit = r => prefer && inside(prefer[0], prefer[1], r.poly);
      rooms.sort((a, b) => (hit(b) - hit(a)) || Math.abs(area(a.poly)) - Math.abs(area(b.poly)));
    }
    return { rooms };
  }
  function inkIn(m, w, b) {
    let n = 0, k = 0;
    for (let y = Math.round(b.y0); y < Math.round(b.y1); y++) for (let x = Math.round(b.x0); x < Math.round(b.x1); x++) { n++; k += m[y * w + x]; }
    return n ? k / n : 0;
  }
  // The kitchen box, grown a little (a detector's box sits tight on the walls), drawn as a wall.
  function fence(m, w, h, b) {
    const out = m.slice(), gx = (b.x1 - b.x0) * 0.04, gy = (b.y1 - b.y0) * 0.04;
    const X0 = Math.max(1, Math.round(b.x0 - gx)), Y0 = Math.max(1, Math.round(b.y0 - gy));
    const X1 = Math.min(w - 2, Math.round(b.x1 + gx)), Y1 = Math.min(h - 2, Math.round(b.y1 + gy));
    for (let x = X0; x <= X1; x++) { out[Y0 * w + x] = 1; out[Y1 * w + x] = 1; }
    for (let y = Y0; y <= Y1; y++) { out[y * w + X0] = 1; out[y * w + X1] = 1; }
    return out;
  }

  // The outline side the marked wall lies on: parallel to the stroke, within a wall's reach.
  // Its pixel length over the typed length is the real scale; the stroke itself is the fallback
  // when no side matches it within 20%.
  function scaleFrom(poly, t, mm) {
    const strokePx = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]), mid = [(t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2];
    let best = null;
    poly.forEach((P, i) => {
      const Q = poly[(i + 1) % poly.length], L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), u = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L];
      if (Math.abs(u[0] * t.u[0] + u[1] * t.u[1]) < 0.95) return;
      const d = Math.abs((mid[0] - P[0]) * u[1] - (mid[1] - P[1]) * u[0]), along = (mid[0] - P[0]) * u[0] + (mid[1] - P[1]) * u[1];
      if (along < 0 || along > L || d > t.T * 3 + 10) return;
      if (!best || d < best.d) best = { i, d, L };
    });
    const px = best && Math.abs(best.L - strokePx) <= 0.2 * strokePx ? best.L : strokePx;
    return { pxPerMm: px / mm, edge: best ? best.i : -1 };
  }

  // Traced room (px) -> the applyVisionExtract() draft (mm, first corner nearest top-left, clockwise).
  function toDraft(room, pxPerMm) {
    const p = room.poly, n = p.length, x0 = Math.min(...p.map(q => q[0])), y0 = Math.min(...p.map(q => q[1]));
    const mm = v => Math.round(v / pxPerMm);
    let s = 0; p.forEach((q, i) => { if (q[0] + q[1] < p[s][0] + p[s][1]) s = i; });
    const idx = i => (i - s + n) % n;
    const corners = [...p.slice(s), ...p.slice(0, s)].map(([x, y]) => [mm(x - x0), mm(y - y0)]);
    return {
      room: { corners_mm: corners },
      openWalls: room.edges.map((e, i) => e.kind === 'open' ? idx(i) : -1).filter(i => i >= 0),
      openings: room.openings.filter(o => !o.removed).map(o => ({ type: o.type, ...(o.variant ? { variant: o.variant } : {}), wallIndex: idx(o.edge),
        width_mm: mm(o.e - o.s), distanceFromStart_mm: mm((o.s + o.e) / 2) })),
      structures: room.cols.map(c => ({ type: 'column', x_mm: mm((c.x0 + c.x1) / 2 - x0), y_mm: mm((c.y0 + c.y1) / 2 - y0),
        width_mm: mm(c.x1 - c.x0), depth_mm: mm(c.y1 - c.y0) })),
    };
  }

  root.WallTrace = { learn, trace, scaleFrom, toDraft, area };
})(globalThis);
