/* MyOpenMath / IMathAS graph reader.
 *
 * Paste this whole file through javascript_tool once per page load. Globals
 * survive hash navigation (#/skip/N) but not a reload.
 *
 *   __C(12)        calibrate question 12's graph -> {x0,y0,sx,sy,xrange,atInt,dots}
 *   __C(22, 1)     second graph on the question (0-indexed)
 *   __pick()       select the real curve, discarding gridlines
 *   __at(1)        f(1)
 *   __solve(-1)    every x where f(x) = -1
 *   __cls(25, 0)   odd / even / neither
 *
 * Why not just read the axis labels: y-axis labels are drawn ~5.3px BELOW their
 * gridline while x-labels are centred. Calibrating off labels skews y by ~0.18
 * units, which silently rounds to the wrong integer. So the origin is taken from
 * the axis path and only the SCALE comes from the labels.
 */

window.__C = function (qn, gi) {
  qn = qn || +location.hash.match(/skip\/(\d+)/)[1];
  gi = gi || 0;
  var wrap = document.getElementById('questionwrap' + (qn - 1));
  if (!wrap) throw new Error('no questionwrap' + (qn - 1));
  // A plot has a numeric width ("300"). Exclude "5.21ex" MathJax glyphs AND the
  // 14/16px video + magnifier icons, which are also numeric - hence the size and
  // tick-label checks. Without them, gi=1 silently returns an icon.
  var svgs = [].slice.call(wrap.querySelectorAll('svg')).filter(function (e) {
    var w = e.getAttribute('width') || '';
    return /^\d+$/.test(w) && +w >= 100 && e.querySelectorAll('text').length >= 4;
  });
  var s = svgs[gi];
  if (!s) throw new Error('no plot svg at index ' + gi);

  var W = +s.getAttribute('width'), H = +s.getAttribute('height');
  var paths = [].slice.call(s.querySelectorAll('path'))
    .map(function (p) { return p.getAttribute('d') || ''; });

  // origin from the axis lines: "M0,y0 W,y0" and "Mx0,0 x0,H"
  var x0 = null, y0 = null;
  paths.forEach(function (d) {
    var m = d.match(new RegExp('M0,([0-9.]+) ' + W + ',([0-9.]+)'));
    if (m && m[1] === m[2]) y0 = +m[1];
    m = d.match(new RegExp('M([0-9.]+),0 ([0-9.]+),' + H));
    if (m && m[1] === m[2]) x0 = +m[1];
  });

  // scale from the axis tick labels
  var T = [].slice.call(s.querySelectorAll('text')).map(function (t) {
    return { v: parseFloat(t.textContent), x: +t.getAttribute('x'), y: +t.getAttribute('y') };
  }).filter(function (t) { return !isNaN(t.v); });
  var tally = function (a) { return a.reduce(function (m, k) { m[k] = (m[k] || 0) + 1; return m; }, {}); };
  var rowY = +Object.entries(tally(T.map(function (t) { return t.y; }))).sort(function (a, b) { return b[1] - a[1]; })[0][0];
  var colX = +Object.entries(tally(T.map(function (t) { return t.x; }))).sort(function (a, b) { return b[1] - a[1]; })[0][0];
  var xs = T.filter(function (t) { return t.y === rowY; }).sort(function (a, b) { return a.v - b.v; });
  var ys = T.filter(function (t) { return t.x === colX; }).sort(function (a, b) { return a.v - b.v; });
  var sx = (xs[xs.length - 1].x - xs[0].x) / (xs[xs.length - 1].v - xs[0].v);
  var sy = (ys[ys.length - 1].y - ys[0].y) / (ys[ys.length - 1].v - ys[0].v);
  if (x0 === null) x0 = xs[0].x - xs[0].v * sx;   // fallback only
  if (y0 === null) y0 = ys[0].y - ys[0].v * sy;

  // every polyline, in graph coordinates
  window.__all = paths.map(function (d) {
    return d.split(/[M\s]+/).filter(Boolean)
      .map(function (q) { return q.split(',').map(Number); })
      .filter(function (a) { return a.length === 2 && a.every(function (n) { return !isNaN(n); }); })
      .map(function (p) { return [(p[0] - x0) / sx, (p[1] - y0) / sy]; });
  }).filter(function (c) { return c.length > 8; });

  window.__pick();
  var c = window.__cur;

  // r=4 dots are real marked points; a lone r=5 fill=none is the magnifier icon
  var dots = [].slice.call(s.querySelectorAll('circle')).map(function (o) {
    return {
      x: +(((+o.getAttribute('cx')) - x0) / sx).toFixed(3),
      y: +(((+o.getAttribute('cy')) - y0) / sy).toFixed(3),
      r: o.getAttribute('r'), fill: o.getAttribute('fill')
    };
  }).filter(function (d) { return Math.abs(d.x) < 50 && Math.abs(d.y) < 50; });

  var lo = Math.min(c[0][0], c[c.length - 1][0]), hi = Math.max(c[0][0], c[c.length - 1][0]);
  return {
    x0: x0, y0: y0, sx: +sx.toFixed(3), sy: +sy.toFixed(3),
    nCurves: window.__all.length,
    xrange: [+lo.toFixed(2), +hi.toFixed(2)],
    // if this comes back constant you grabbed an axis - call __pick or inspect __all
    atInt: Array.from({ length: 41 }, function (_, i) { return i - 20; })
      .filter(function (v) { return v >= lo && v <= hi; })
      .map(function (v) { return v + '->' + window.__at(v); }).join('  '),
    dots: dots
  };
};

/* The real curve has all-unique x values. Gridline paths repeat each x twice
   (M x,0  x,H), so they survive a monotonicity test but fail this one. */
window.__pick = function () {
  var cs = window.__all || [];
  var uniq = cs.filter(function (c) {
    return new Set(c.map(function (p) { return p[0].toFixed(4); })).size === c.length;
  });
  var pool = uniq.length ? uniq : cs;
  window.__cur = pool.slice().sort(function (a, b) { return b.length - a.length; })[0];
  return { chosen: cs.indexOf(window.__cur), unique: uniq.length, total: cs.length };
};

/* Piecewise graphs arrive as one path per segment - merge them all. */
window.__merged = function () {
  var segs = (window.__all || []).filter(function (c) {
    return new Set(c.map(function (p) { return p[0].toFixed(3); })).size === c.length;
  });
  return [].concat.apply([], segs).sort(function (a, b) { return a[0] - b[0]; });
};

window.__at = function (x, pts) {
  var c = pts || window.__cur;
  for (var i = 1; i < c.length; i++) {
    var a = c[i - 1], b = c[i];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0])
      return +(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0])).toFixed(3);
  }
  return null;
};

window.__solve = function (t, pts) {
  var c = pts || window.__cur, out = [];
  for (var i = 1; i < c.length; i++) {
    var a = c[i - 1], b = c[i];
    if ((a[1] - t) * (b[1] - t) <= 0 && a[1] !== b[1])
      out.push(+(a[0] + (t - a[1]) * (b[0] - a[0]) / (b[1] - a[1])).toFixed(3));
  }
  return out;
};

/* Odd / Even / Neither. An x with no mirror means the domain isn't symmetric,
   which is itself the answer: Neither. */
window.__cls = function (qn, gi) {
  window.__C(qn, gi);
  var pts = window.__merged();
  var probes = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  var n = 0, even = 0, odd = 0, rows = [];
  probes.forEach(function (x) {
    var p = window.__at(x, pts), m = window.__at(-x, pts);
    if (p === null || m === null) return;
    n++; rows.push(x + ': f=' + p.toFixed(2) + ' f(-x)=' + m.toFixed(2));
    if (Math.abs(p - m) < 0.2) even++;
    if (Math.abs(p + m) < 0.2) odd++;
  });
  return {
    n: n, even: even, odd: odd,
    verdict: n === 0 ? 'Neither (domain not symmetric)'
      : even === n ? 'Even' : odd === n ? 'Odd' : 'Neither',
    rows: rows.slice(0, 5)
  };
};

'myopenmath-graph loaded';
