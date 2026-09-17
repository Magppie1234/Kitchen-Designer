// Millimetres in a y-down plan; Three.js maps plan y to world z.
// Shared by the solver, adapters and browser. No DOM or server dependencies.
(function (root) {
  const area = walls => walls.reduce((s, w) => s + w.a[0] * w.b[1] - w.b[0] * w.a[1], 0) / 2;
  function normal(w, walls) {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy);
    const sign = area(walls) < 0 ? -1 : 1;
    return [-dy / len * sign, dx / len * sign];
  }
  function footprint(w, walls, at, width, depth, offset = 0) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const u = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len], n = normal(w, walls);
    const points = [[at, offset], [at + width, offset], [at + width, offset + depth], [at, offset + depth]]
      .map(([a, d]) => [w.a[0] + u[0] * a + n[0] * d, w.a[1] + u[1] * a + n[1] * d]);
    return { points, x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])),
      y0: Math.min(...points.map(p => p[1])), y1: Math.max(...points.map(p => p[1])) };
  }
  const intersects = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.001
    && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.001;
  function pointInside(x, y, walls) {
    let inside = false;
    for (const { a, b } of walls) if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    return inside;
  }
  // Split at every polygon vertex: unlike corner-only sampling this catches a
  // narrow notch passing through the middle of a cabinet's footprint.
  function containsRect(r, walls) {
    const cuts = (lo, hi, axis) => [...new Set([lo, hi, ...walls.map(w => w.a[axis]).filter(x => x > lo && x < hi)])].sort((a, b) => a - b);
    const xs = cuts(r.x0, r.x1, 0), ys = cuts(r.y0, r.y1, 1);
    for (let i = 1; i < xs.length; i++) for (let k = 1; k < ys.length; k++)
      if (!pointInside((xs[i - 1] + xs[i]) / 2, (ys[k - 1] + ys[k]) / 2, walls)) return false;
    return true;
  }
  root.KitchenGeometry = { area, normal, footprint, intersects, pointInside, containsRect };
})(globalThis);
