/*
 * organic-net.js: seeded generator for the loom graph, drawn as bioluminescent mycelium in SVG.
 * No dependencies. Same input + seed => same picture.
 *
 *   OrganicNet.render(svgEl, graph, opts) -> model
 *   OrganicNet.build(graph, opts)         -> { svg, model }   (pure string output)
 *
 * graph = { nodes: [{ id, label, date, age /* 0 = oldest, 1 = newest *\/, parent? }],
 *           links: [[idA, idB], ...] }      // optional cross-links (non-tree)
 * opts  = { seed, activeId, onSelect(id), legend: { from, to }, overrides: {...partial CONFIG} }
 *
 * Pipeline: layout (roots relax apart, children grow along noisy self-avoiding walks that may
 * fork off sibling hyphae) -> geometry (knot outlines that swell toward each attached hypha,
 * tapered hyphae, side hairs, rhizoids) -> one SVG filter over the whole tissue layer (gooey
 * alpha fusion for continuous joins, displacement, diffuse + specular lighting, grain, rim, a
 * light bloom). Age reads as tissue maturity: old = dim, dense knots; new = bright growing tips.
 */
(function (root) {
  "use strict";
  const TAU = Math.PI * 2;

  /* ── seeded randomness ─────────────────────────────────────────── */
  function hash(s) {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function noise1(seed) {
    const r = prng(seed), v = [];
    for (let i = 0; i < 256; i++) v.push(r() * 2 - 1);
    return function (x) {
      const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
      return v[i & 255] * (1 - t) + v[(i + 1) & 255] * t;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (u) => u * u * (3 - 2 * u);
  const f1 = (n) => { const v = Math.round(n * 10) / 10; return Object.is(v, -0) ? "0" : String(v); };
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── colour ─────────────────────────────────────────────────────── */
  function rgb(hex) { hex = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
  function mixc(a, b, t) { const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
  function ramp(stops, f) {
    f = clamp(f, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(f));
    return mixc(stops[i], stops[i + 1], f - i);
  }

  /* ── config ──────────────────────────────────────────────────────── */
  const CONFIG = {
    key: "mycelium", width: 960, height: 600, margin: 46, size: 1.3, fitMax: 1.6,
    rootR: [13, 16], childR: [6.5, 8], matureGrow: 0.28,   // old knots are a bit larger (grown)
    len: [100, 170], step: 6, wander: 0.95, wanderFreq: 0.22, avoid: 0.9, forkFromTrunk: 0.55,
    lobes: 0.16, lobeFine: 0.06, hillock: 0.6, hillockWidth: 0.5,
    shaft: [3.6, 1.1], flare: 0.9, beads: 0.05, beadFreq: 0.09, jitter: 0.1,
    hairs: 9, hairLen: [10, 30], hairCurl: 0.9, rhizoids: 7,
    filaments: 46, filamentLen: [50, 160], specks: 40,
    ramp: ["#2c4652", "#3d6b5a", "#5e9420", "#9fd247", "#d3f08e"],
    halo: 0.32, haloR: [1.5, 1.1], tipSpark: 0.55,          // kept low: luminous, not a lamp
    goo: { blur: 2.6, mul: 22, off: 7 },
    displace: { freq: 0.035, scale: 2.4 },
    light: { soft: 2.0, surface: 3.6, diffuse: 1.0, az: 235, el: 52, mulK: 0.82, ambient: 0.36,
             spec: 0.6, specExp: 28, specColor: "#f2ffd8" },
    grain: { type: "fractalNoise", freq: 0.9, oct: 2, amount: 0.32 },
    rim: { erode: 1.2, blur: 1.2, color: "#e2f7b8", amount: 0.32 },
    bloom: { blur: 3, amount: 0.22 },
    labelHalo: "rgba(2,8,24,0.88)",
    legendHint: "dim, dense knots = matured · bright tips = still growing",
  };
  const NESTED = ["goo", "displace", "light", "grain", "rim", "bloom"];

  function resolve(opts) {
    const o = opts.overrides || {}, cfg = Object.assign({}, CONFIG, o);
    for (const k of NESTED) cfg[k] = Object.assign({}, CONFIG[k], o[k] || {});
    cfg.seed = opts.seed != null ? opts.seed : 11;
    return cfg;
  }

  /* ── geometry helpers ──────────────────────────────────────────── */
  function chaikin(pts, it) {
    for (let k = 0; k < it; k++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        o.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      o.push(pts[pts.length - 1]);
      pts = o;
    }
    return pts;
  }
  function resample(pts, ds) {
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1]; const b = pts[i];
      let seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (acc + seg >= ds) {
        const t = (ds - acc) / seg;
        a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        out.push(a); seg = Math.hypot(b.x - a.x, b.y - a.y); acc = 0;
      }
      acc += seg;
    }
    const last = pts[pts.length - 1], tail = out[out.length - 1];
    if (Math.hypot(last.x - tail.x, last.y - tail.y) > ds * 0.3) out.push(last); else out[out.length - 1] = last;
    return out;
  }
  function closedSmooth(pts) {
    const n = pts.length, d = [`M${f1(pts[0].x)} ${f1(pts[0].y)}`];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d.push(`C${f1(p1.x + (p2.x - p0.x) / 6)} ${f1(p1.y + (p2.y - p0.y) / 6)} ${f1(p2.x - (p3.x - p1.x) / 6)} ${f1(p2.y - (p3.y - p1.y) / 6)} ${f1(p2.x)} ${f1(p2.y)}`);
    }
    return d.join("") + "Z";
  }
  function openSmooth(pts) {
    const d = [`M${f1(pts[0].x)} ${f1(pts[0].y)}`];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d.push(`C${f1(p1.x + (p2.x - p0.x) / 6)} ${f1(p1.y + (p2.y - p0.y) / 6)} ${f1(p2.x - (p3.x - p1.x) / 6)} ${f1(p2.y - (p3.y - p1.y) / 6)} ${f1(p2.x)} ${f1(p2.y)}`);
    }
    return d.join("");
  }
  function cumLen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return c; }
  function headingAt(pts, i) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return Math.atan2(b.y - a.y, b.x - a.x); }

  /** Closed filled taper with round caps. widthAt(s, L) -> full width. */
  function ribbon(pts, widthAt) {
    const c = cumLen(pts), L = c[c.length - 1] || 1, left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const h = headingAt(pts, i), nx = -Math.sin(h), ny = Math.cos(h), w = Math.max(0.25, widthAt(c[i], L) / 2);
      left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
      right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    const cap = (i, dir) => {
      const h = headingAt(pts, i) + (dir < 0 ? Math.PI : 0), w = Math.max(0.25, widthAt(c[i], L) / 2), o = [];
      for (let k = 1; k < 6; k++) {
        const a = h - Math.PI / 2 + (k / 6) * Math.PI;
        o.push({ x: pts[i].x + Math.cos(a) * w, y: pts[i].y + Math.sin(a) * w });
      }
      return o;
    };
    const ring = left.concat(cap(pts.length - 1, 1), right.reverse(), cap(0, -1));
    return "M" + ring.map((p) => `${f1(p.x)} ${f1(p.y)}`).join("L") + "Z";
  }

  /** Soma outline: low harmonics + fine wobble + hillock bumps toward each attached hypha. */
  function somaPts(cx, cy, R, dirs, cfg, seed) {
    const r = prng(seed), N = 90, harm = [];
    for (let h = 2; h <= 5; h++) harm.push([h, cfg.lobes * (r() * 0.8 + 0.4) / (h - 1), r() * TAU]);
    for (let h = 7; h <= 12; h += 2) harm.push([h, cfg.lobeFine * (r() * 0.8 + 0.4), r() * TAU]);
    r(); const pts = []; // r() keeps the seeded sequence stable
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      let m = 1;
      for (const [h, amp, ph] of harm) m += amp * Math.sin(h * a + ph);
      for (const d0 of dirs) { const d = angDiff(a, d0); m += cfg.hillock * Math.exp(-(d * d) / (cfg.hillockWidth * cfg.hillockWidth)); }
      pts.push({ x: cx + Math.cos(a) * R * m, y: cy + Math.sin(a) * R * m });
    }
    return pts;
  }

  /* ── layout ─────────────────────────────────────────────────────── */
  function prepare(graph) {
    const nodes = graph.nodes.map((n) => ({ id: n.id, label: n.label || n.id, age: clamp(n.age == null ? 0.5 : n.age, 0, 1), parent: n.parent || null, date: n.date || "" }));
    const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
    for (const n of nodes) { if (n.parent && !by[n.parent]) n.parent = null; n.kids = []; }
    for (const n of nodes) if (n.parent) by[n.parent].kids.push(n);
    const depth = (n) => (n.parent ? 1 + depth(by[n.parent]) : 0);
    for (const n of nodes) { n.depth = depth(n); n.kids.sort((a, b) => a.age - b.age || a.id.localeCompare(b.id)); }
    const desc = (n) => n.kids.reduce((s, k) => s + 1 + desc(k), 0);
    for (const n of nodes) n.desc = desc(n);
    const links = (graph.links || []).filter(([a, b]) => by[a] && by[b] && a !== b);
    return { nodes, by, links, roots: nodes.filter((n) => !n.parent) };
  }

  function layout(G, cfg, seed) {
    const r = prng(seed), W = cfg.width, H = cfg.height, M = cfg.margin;
    const legend = { x0: 0, y0: H - 78, x1: 300, y1: H };
    const rootOf = (n) => (n.parent ? rootOf(G.by[n.parent]) : n);
    // sizes
    for (const n of G.nodes) {
      const rr = prng(hash(n.id + ":r"))(), [a, b] = n.depth ? cfg.childR : cfg.rootR;
      n.R = cfg.size * (a + (b - a) * rr) * (1 + cfg.matureGrow * (1 - n.age) - cfg.matureGrow * 0.5);
    }
    // roots: relax discs apart, weak pull along cross-links
    const roots = G.roots, reach = (n) => n.R + 18 + (n.desc ? cfg.len[1] * (0.62 + 0.1 * Math.sqrt(n.desc)) : 26);
    roots.forEach((n) => { n.x = M + 120 + r() * (W - 2 * M - 240); n.y = M + 80 + r() * (H - 2 * M - 160); });
    const rlinks = [];
    for (const [a, b] of G.links) { const A = rootOf(G.by[a]), B = rootOf(G.by[b]); if (A !== B) rlinks.push([A, B]); }
    for (let it = 0; it < 260; it++) {
      const cool = 1 - it / 260;
      for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
        const a = roots[i], b = roots[j]; let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1, need = (reach(a) + reach(b)) * 0.78;
        if (d < need) { const f = (need - d) * 0.25; dx /= d; dy /= d; a.x -= dx * f; a.y -= dy * f; b.x += dx * f; b.y += dy * f; }
      }
      for (const [a, b] of rlinks) { const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, need = (reach(a) + reach(b)) * 0.95; if (d > need) { const f = (d - need) * 0.01; a.x += dx / d * f; a.y += dy / d * f; b.x -= dx / d * f; b.y -= dy / d * f; } }
      for (const n of roots) {
        const pad = Math.min(reach(n) * 0.55, 150);
        n.x += (r() - 0.5) * 6 * cool; n.y += (r() - 0.5) * 6 * cool;
        n.x = clamp(n.x, M + pad, W - M - pad); n.y = clamp(n.y, M + pad * 0.7, H - M - pad * 0.7);
        if (n.x < legend.x1 + 20 && n.y > legend.y0 - 40) n.y = legend.y0 - 40;
      }
    }
    // growth
    const occ = []; // {x,y,r,root}
    const paths = []; // tissue centerlines: {pts, parent, child, w0, w1, fromTrunk}
    for (const n of roots) occ.push({ x: n.x, y: n.y, r: n.R + 10, root: n });
    const outOf = (x, y) => (x < M ? M - x : 0) + (x > W - M ? x - W + M : 0) + (y < M ? M - y : 0) + (y > H - M ? y - H + M : 0) +
      (x < legend.x1 && y > legend.y0 - 20 ? 40 : 0);
    const cost = (x, y, own, skip) => {
      let s = outOf(x, y) * 3;
      for (let i = 0; i < occ.length; i++) {
        if (i >= skip[0] && i < skip[1]) continue;
        const o = occ[i], d = Math.hypot(o.x - x, o.y - y), lim = o.r + 16;
        if (d < lim) s += (lim - d) * (o.root === own ? 1 : 3);
      }
      return s;
    };
    const grow = (p) => {
      const own = rootOf(p);
      const sibPaths = [];
      for (const c of p.kids) {
        const nz = noise1(hash(c.id + ":walk") ^ seed), L = cfg.len[0] + r() * (cfg.len[1] - cfg.len[0]);
        let start = { x: p.x, y: p.y }, prefix = [], h0, trunk = null, trunkS = 0;
        if (sibPaths.length && r() < cfg.forkFromTrunk) {
          trunk = sibPaths[Math.floor(r() * sibPaths.length)];
          const tp = trunk.pts, i = Math.floor(tp.length * (0.3 + r() * 0.3));
          start = tp[i]; trunkS = cumLen(tp)[i];
          h0 = headingAt(tp, i) + (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.45);
        } else {
          let best = Infinity;
          for (let k = 0; k < 36; k++) {
            const a = (k / 36) * TAU + r() * 0.1; let s = r() * 12;
            for (let d = 18; d <= L; d += 14) s += cost(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, own, [-1, -1]);
            if (s < best) { best = s; h0 = a; }
          }
        }
        const occStart = occ.length;
        const pts = [start]; let h = h0, x = start.x, y = start.y;
        const steps = Math.ceil(L / cfg.step);
        for (let s = 0; s < steps; s++) {
          h += nz(s * cfg.wanderFreq * 3) * cfg.wander * 0.35;
          // steer away from crowding (ignore own fresh points)
          let sx = 0, sy = 0;
          for (let i = 0; i < occStart; i++) { const o = occ[i], dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy); const lim = o.r + 26; if (d < lim && d > 0.01 && !(o.node === p && s < 4)) { const w = (lim - d) / lim; sx += dx / d * w; sy += dy / d * w; } }
          sx -= (x < M + 20 ? -1 : x > W - M - 20 ? 1 : 0); sy -= (y < M + 20 ? -1 : y > H - M - 20 ? 1 : 0);
          if (sx || sy) h += angDiff(Math.atan2(sy, sx), h) * 0.18 * cfg.avoid * Math.min(1, Math.hypot(sx, sy));
          h += angDiff(h0, h) * 0.06; // keep a general heading so it doesn't curl back
          x += Math.cos(h) * cfg.step; y += Math.sin(h) * cfg.step;
          pts.push({ x, y });
          if (s % 2) occ.push({ x, y, r: 5, root: own });
        }
        c.x = x; c.y = y;
        const sm = resample(chaikin(pts, 2), 2.4);
        const path = { pts: sm, parent: p, child: c, trunk, trunkS };
        paths.push(path); sibPaths.push(path);
        occ.push({ x, y, r: c.R + 10, root: own, node: c });
        grow(c);
      }
    };
    for (const n of roots) grow(n);
    // fit: scale positions (not sizes) into the canvas
    const xs = [], ys = [];
    for (const n of G.nodes) { xs.push(n.x - n.R, n.x + n.R); ys.push(n.y - n.R, n.y + n.R); }
    for (const p of paths) for (const q of p.pts) { xs.push(q.x); ys.push(q.y); }
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const sc = Math.min((W - 2 * M - 30) / (bx1 - bx0), (H - 2 * M - 40) / (by1 - by0), cfg.fitMax);
    const ox = (W - (bx1 - bx0) * sc) / 2 - bx0 * sc, oy = (H - 14 - (by1 - by0) * sc) / 2 - by0 * sc;
    const T = (q) => { q.x = q.x * sc + ox; q.y = q.y * sc + oy; };
    const moved = new Set();
    for (const n of G.nodes) T(n);
    for (const p of paths) for (const q of p.pts) if (!moved.has(q)) { moved.add(q); T(q); }
    for (const p of paths) { p.trunkS *= sc; p.L = cumLen(p.pts).slice(-1)[0]; }
    return { paths, legend, rootOf };
  }

  /* ── labels ─────────────────────────────────────────────────────── */
  let measureCtx = null;
  function textW(s, size, weight) {
    try {
      if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
      if (measureCtx) { measureCtx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`; return measureCtx.measureText(s).width; }
    } catch (e) { /* fall through */ }
    return s.length * size * 0.56;
  }
  function placeLabels(G, geo, cfg) {
    const W = cfg.width, H = cfg.height, boxes = [], tissue = [];
    for (const p of geo.paths) for (let i = 0; i < p.pts.length; i += 3) tissue.push(p.pts[i]);
    for (const h of geo.hairs) tissue.push(h.tip);
    const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const L = geo.legend;
    const order = [...G.nodes].sort((a, b) => a.depth - b.depth || b.R - a.R);
    const boxOf = (n, c) => { const x0 = c.anchor === "start" ? c.x : c.anchor === "end" ? c.x - n.tw : c.x - n.tw / 2; return { x0: x0 - 2, x1: x0 + n.tw + 2, y0: c.y - n.fs * 0.82, y1: c.y + n.fs * 0.26 }; };
    const scoreOf = (n, c, skipSelf) => {
      const b = boxOf(n, c); let s = c.pen;
      if (b.x0 < 6 || b.x1 > W - 6 || b.y0 < 6 || b.y1 > H - 4) s += 1e6;
      if (b.x0 < L.x1 && b.y1 > L.y0) s += 1e6;
      for (const o of boxes) if (o.n !== skipSelf) s += ov(b, o.b) * 60;
      for (const m of G.nodes) { const rr = m.R * 1.25 + 3; s += ov(b, { x0: m.x - rr, x1: m.x + rr, y0: m.y - rr, y1: m.y + rr }) * 40; }
      for (const t of tissue) if (t.x > b.x0 - 2 && t.x < b.x1 + 2 && t.y > b.y0 - 2 && t.y < b.y1 + 2) s += 70;
      // a label must read as belonging to its own node: nearest node to the label box must be n
      const qx = clamp(n.x, b.x0, b.x1), qy = clamp(n.y, b.y0, b.y1), dn = Math.hypot(qx - n.x, qy - n.y);
      for (const m of G.nodes) if (m !== n) { const mx = clamp(m.x, b.x0, b.x1), my = clamp(m.y, b.y0, b.y1), dm = Math.hypot(mx - m.x, my - m.y); if (dm < dn + 10) s += 160 + (dn + 10 - dm) * 8; }
      return s;
    };
    const cands = (n) => {
      const out = [], par = n.parent ? G.by[n.parent] : null;
      const outward = par ? Math.atan2(n.y - par.y, n.x - par.x) : null;
      [n.R * 1.35 + 6, n.R * 1.35 + 16, n.R * 1.35 + 30].forEach((d, di) => {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU, c = Math.cos(a), s = Math.sin(a);
          const anchor = c > 0.38 ? "start" : c < -0.38 ? "end" : "middle";
          const y = n.y + s * d + (s > 0.38 ? n.fs * 0.78 : s < -0.38 ? -1 : n.fs * 0.32);
          let pen = di * di * 30 + (anchor === "middle" ? 0 : 4);
          if (outward != null) pen += (1 - Math.cos(angDiff(a, outward))) * 22;
          out.push({ x: n.x + c * d, y, anchor, pen });
        }
      });
      return out;
    };
    for (const n of G.nodes) { n.fs = n.depth ? 12.5 : 15.5; n.fw = n.depth ? 500 : 650; n.tw = textW(n.label, n.fs, n.fw); }
    for (const n of order) {
      let best = null, bs = Infinity;
      for (const c of cands(n)) { const s = scoreOf(n, c); if (s < bs) { bs = s; best = c; } }
      n.lab = best; boxes.push({ n, b: boxOf(n, best) });
    }
    for (let round = 0; round < 3; round++) for (const n of order) {
      let best = n.lab, bs = scoreOf(n, n.lab, n);
      for (const c of cands(n)) { const s = scoreOf(n, c, n); if (s < bs) { bs = s; best = c; } }
      n.lab = best; boxes.find((o) => o.n === n).b = boxOf(n, best);
    }
    let overlaps = 0, tissueHits = 0, total = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) if (ov(boxes[i].b, boxes[j].b) > 0) overlaps++;
      const b = boxes[i].b;
      for (const t of tissue) if (t.x > b.x0 && t.x < b.x1 && t.y > b.y0 && t.y < b.y1) tissueHits++;
      for (const m of G.nodes) if (m !== boxes[i].n && ov(b, { x0: m.x - m.R, x1: m.x + m.R, y0: m.y - m.R, y1: m.y + m.R }) > 0) overlaps++;
      total += scoreOf(boxes[i].n, boxes[i].n.lab, boxes[i].n);
    }
    return { overlaps, tissueHits, cost: total };
  }

  /* ── tissue geometry ───────────────────────────────────────────── */
  function geometry(G, geo, cfg, seed) {
    const r = prng(seed ^ 0x9e37), hairs = [];
    const shaftW = (p) => { const d = p.parent.depth; const k = Math.pow(0.62, d); return [cfg.size * cfg.shaft[0] * k, Math.max(0.8, cfg.size * cfg.shaft[1] * Math.pow(0.8, d))]; };
    for (const p of geo.paths) {
      const [w0, w1] = shaftW(p), nz = noise1(hash(p.child.id + ":w"));
      const Rp = p.trunk ? 0 : p.parent.R, Rc = p.child.R;
      let base0 = w0;
      if (p.trunk) { const tw = p.trunk.widthAt(p.trunkS, p.trunk.L); base0 = Math.min(w0, tw * 0.85); }
      p.widthAt = (s, L) => {
        const u = s / L;
        let w = base0 + (w1 - base0) * smooth(clamp(u, 0, 1));
        w *= 1 + cfg.beads * nz(s * cfg.beadFreq) + cfg.jitter * nz(s * 0.6 + 40) * 0.5;
        // hillock flare out of the parent soma and into the child soma
        if (Rp) w = Math.max(w, Rp * 1.5 * cfg.flare * Math.exp(-Math.pow(s / (Rp * 1.5), 2)));
        w = Math.max(w, Rc * 1.15 * cfg.flare * Math.exp(-Math.pow((L - s) / (Rc * 1.6), 2)));
        return w;
      };
      // hairs / spines: count grows with maturity of the child
      const n = Math.round(cfg.hairs * (0.35 + 0.9 * (1 - p.child.age)) * (p.L / 120));
      for (let i = 0; i < n; i++) {
        const s = p.L * (0.18 + r() * 0.66), idx = Math.min(p.pts.length - 1, Math.round(s / 2.4));
        hairs.push(makeHair(p.pts[idx], headingAt(p.pts, idx), p.widthAt(s, p.L), cfg, r, p));
      }
    }
    for (const n of G.nodes) {
      const k = Math.round(cfg.rhizoids * (n.depth ? 0.35 : 1) * (0.4 + (1 - n.age)));
      for (let i = 0; i < k; i++) {
        const a = r() * TAU, pt = { x: n.x + Math.cos(a) * n.R * 0.7, y: n.y + Math.sin(a) * n.R * 0.7 };
        hairs.push(makeHair(pt, a, n.R * 0.45, cfg, r, { child: n }, [cfg.hairLen[0] * 1.2, cfg.hairLen[1] * 1.3]));
      }
    }
    geo.hairs = hairs;
  }
  function makeHair(at, heading, baseW, cfg, r, p, lenR) {
    const side = r() < 0.5 ? -1 : 1, a0 = heading + (lenR ? 0 : side * (0.6 + r() * 0.7));
    const LR = lenR || cfg.hairLen.map((v) => v * cfg.size), L = LR[0] + r() * (LR[1] - LR[0]);
    const pts = [{ x: at.x, y: at.y }]; let h = a0, x = at.x, y = at.y; const curl = (r() - 0.5) * cfg.hairCurl * 0.5;
    for (let s = 0; s < L; s += 3) { h += curl + (r() - 0.5) * 0.15; x += Math.cos(h) * 3; y += Math.sin(h) * 3; pts.push({ x, y }); }
    const sm = resample(chaikin(pts, 1), 1.6), w0 = Math.max(1, baseW * 0.55);
    return { pts: sm, w0, tip: sm[sm.length - 1], node: p.child };
  }
  function wobble(a, b, r, amt) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d, k = (r() - 0.5) * 2 * amt * d, k2 = (r() - 0.5) * amt * d;
    const pts = [a, { x: a.x + dx * 0.33 + nx * k, y: a.y + dy * 0.33 + ny * k }, { x: a.x + dx * 0.66 + nx * k2, y: a.y + dy * 0.66 + ny * k2 }, b];
    return resample(chaikin(pts, 3), 2.4);
  }

  /* ── SVG assembly ──────────────────────────────────────────────── */
  function filters(cfg, uid) {
    const { width: W, height: H, goo, displace: dp, light: l, grain: g, rim, bloom } = cfg;
    const box = `filterUnits="userSpaceOnUse" x="-40" y="-40" width="${W + 80}" height="${H + 80}" color-interpolation-filters="sRGB"`;
    return `
<filter id="${uid}-tissue" ${box}>
  <feGaussianBlur in="SourceGraphic" stdDeviation="${goo.blur}" result="b"/>
  <feColorMatrix in="b" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${goo.mul} -${goo.off}" result="goo"/>
  <feComposite in="SourceGraphic" in2="goo" operator="over" result="fused"/>
  <feTurbulence type="fractalNoise" baseFrequency="${dp.freq}" numOctaves="2" seed="${cfg.seed % 97}" result="dn"/>
  <feDisplacementMap in="fused" in2="dn" scale="${dp.scale}" xChannelSelector="R" yChannelSelector="G" result="body"/>
  <feGaussianBlur in="body" stdDeviation="${l.soft}" result="h1"/>
  <feGaussianBlur in="body" stdDeviation="${l.soft * 3.2}" result="h2"/>
  <feComposite in="h1" in2="h2" operator="arithmetic" k2="0.45" k3="0.55" result="h3"/>
  <feComposite in="h3" in2="body" operator="in" result="height"/>
  <feDiffuseLighting in="height" surfaceScale="${l.surface}" diffuseConstant="${l.diffuse}" lighting-color="#ffffff" result="diff"><feDistantLight azimuth="${l.az}" elevation="${l.el}"/></feDiffuseLighting>
  <feSpecularLighting in="height" surfaceScale="${l.surface}" specularConstant="${l.spec}" specularExponent="${l.specExp}" lighting-color="${l.specColor}" result="spec"><feDistantLight azimuth="${l.az}" elevation="${l.el + 12}"/></feSpecularLighting>
  <feComposite in="spec" in2="body" operator="in" result="specIn"/>
  <feComposite in="body" in2="diff" operator="arithmetic" k1="${l.mulK}" k2="${l.ambient}" result="lit"/>
  <feTurbulence type="${g.type}" baseFrequency="${g.freq}" numOctaves="${g.oct}" seed="${(cfg.seed * 7) % 89}" result="gn"/>
  <feColorMatrix in="gn" type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1" result="gray"/>
  <feComposite in="lit" in2="gray" operator="arithmetic" k1="${(g.amount * 2).toFixed(2)}" k2="${(1 - g.amount).toFixed(2)}" result="tex0"/>
  <feComposite in="tex0" in2="body" operator="in" result="tex"/>
  <feMorphology in="body" operator="erode" radius="${rim.erode}" result="er"/>
  <feGaussianBlur in="er" stdDeviation="${rim.blur}" result="erb"/>
  <feComposite in="body" in2="erb" operator="out" result="rimMask"/>
  <feFlood flood-color="${rim.color}" flood-opacity="${rim.amount}"/>
  <feComposite in2="rimMask" operator="in" result="rimC"/>
  <feMerge result="fin"><feMergeNode in="tex"/><feMergeNode in="rimC"/><feMergeNode in="specIn"/></feMerge>
  <feGaussianBlur in="fin" stdDeviation="${bloom.blur}" result="bl"/>
  <feComponentTransfer in="bl" result="bl2"><feFuncA type="linear" slope="${bloom.amount}"/></feComponentTransfer>
  <feMerge><feMergeNode in="bl2"/><feMergeNode in="fin"/></feMerge>
</filter>
<filter id="${uid}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter>`;
  }

  function build(graph, opts) {
    opts = opts || {};
    const cfg = resolve(opts), W = cfg.width, H = cfg.height, uid = "on" + (hash(cfg.key + cfg.seed) % 1e6);
    // choose the best of a few seeded layouts (labels clear, clusters apart)
    let best = null;
    const tries = opts.tries || 16;
    for (let k = 0; k < tries; k++) {
      const G = prepare(graph), s = hash(cfg.key + ":" + cfg.seed + ":" + k);
      const geo = layout(G, cfg, s);
      geometry(G, geo, cfg, s);
      const lab = placeLabels(G, geo, cfg);
      let cross = 0;
      for (const p of geo.paths) for (const q of p.pts) for (const n of G.nodes) if (geo.rootOf(n) !== geo.rootOf(p.parent) && Math.hypot(q.x - n.x, q.y - n.y) < n.R + 14) cross++;
      // different clusters must not tangle: count close point pairs between clusters
      const pts = [];
      for (const p of geo.paths) for (let i = 0; i < p.pts.length; i += 3) pts.push([p.pts[i], geo.rootOf(p.parent)]);
      for (const h of geo.hairs) pts.push([h.tip, geo.rootOf(h.node)]);
      for (const n of G.nodes) pts.push([n, geo.rootOf(n)]);
      let tangle = 0;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i][1] !== pts[j][1]) { const d = Math.hypot(pts[i][0].x - pts[j][0].x, pts[i][0].y - pts[j][0].y); if (d < 34) tangle += 34 - d; }
      const score = lab.cost + lab.overlaps * 5e4 + lab.tissueHits * 300 + cross * 400 + tangle * 30;
      if (!best || score < best.score) best = { G, geo, lab, score, s, tangle };
    }
    const { G, geo } = best, col = (f) => ramp(cfg.ramp, f), bg = "#020818";
    const grads = [], dark = "#06101f";
    let gi = 0;
    const lin = (a, b, ca, cb) => { const id = `${uid}-g${gi++}`; grads.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}"><stop offset="0" stop-color="${ca}"/><stop offset="1" stop-color="${cb}"/></linearGradient>`); return id; };
    const rad = (c) => { const id = `${uid}-g${gi++}`; grads.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.55" fx="0.36" fy="0.32"><stop offset="0" stop-color="${mixc(c, "#ffffff", 0.22)}"/><stop offset="0.7" stop-color="${c}"/><stop offset="1" stop-color="${c}"/></radialGradient>`); return id; };
    const sr = prng(best.s ^ 0x51);

    // background: specks and fine field filaments (non-interactive)
    let back = "";
    for (let i = 0; i < cfg.specks; i++) {
      const x = sr() * W, y = sr() * H, rr = 0.4 + sr() * 1.0;
      back += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${col(sr())}" opacity="${f1(0.08 + sr() * 0.25)}"/>`;
    }
    const tips = G.nodes.map((n) => n).concat(geo.hairs.filter(() => sr() < 0.25).map((h) => ({ x: h.tip.x, y: h.tip.y, age: h.node.age })));
    for (let i = 0; i < cfg.filaments; i++) {
      const t = tips[Math.floor(sr() * tips.length)], L = cfg.filamentLen[0] + sr() * (cfg.filamentLen[1] - cfg.filamentLen[0]);
      let h = sr() * TAU, x = t.x, y = t.y; const pts = [{ x, y }];
      for (let s = 0; s < L; s += 6) { h += (sr() - 0.5) * 0.7; x += Math.cos(h) * 6; y += Math.sin(h) * 6; pts.push({ x, y }); }
      const id = lin(pts[0], pts[pts.length - 1], col(t.age), bg);
      back += `<path d="${openSmooth(chaikin(pts, 2))}" fill="none" stroke="url(#${id})" stroke-width="${f1(0.5 + sr() * 0.5)}" opacity="${f1(0.25 + 0.45 * (t.age || 0))}" stroke-linecap="round"/>`;
    }
    // age halos (young = brighter, wider glow)
    let glow = "";
    for (const n of G.nodes) {
      const a = cfg.halo * Math.pow(n.age, 1.4); if (a < 0.03) continue;
      const id = `${uid}-h${gi++}`;
      grads.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${col(n.age)}" stop-opacity="${f1(0.55 * a)}"/><stop offset="1" stop-color="${col(n.age)}" stop-opacity="0"/></radialGradient>`);
      glow += `<circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${f1(n.R * (cfg.haloR[0] + cfg.haloR[1] * n.age))}" fill="url(#${id})"/>`;
    }
    // cross-links
    let links = "";
    const lr = prng(best.s ^ 0x77);
    for (const [ia, ib] of G.links) {
      const a = G.by[ia], b = G.by[ib], pts = wobble(a, b, lr, 0.16), id = lin(a, b, col(a.age), col(b.age));
      links += `<path class="on-link" d="${openSmooth(pts)}" fill="none" stroke="url(#${id})" stroke-width="1" stroke-dasharray="1.5 4.5" stroke-linecap="round" opacity="0.55"/>`;
    }
    // tissue: hyphae, hairs, then knots on top
    let tissue = "";
    for (const p of geo.paths) {
      const a = p.pts[0], b = p.pts[p.pts.length - 1];
      const id = lin(a, b, col(p.trunk ? (p.parent.age + p.child.age) / 2 : p.parent.age), col(p.child.age));
      tissue += `<path d="${ribbon(p.pts, p.widthAt)}" fill="url(#${id})"/>`;
    }
    for (const h of geo.hairs) {
      const c = col(h.node.age), id = lin(h.pts[0], h.tip, c, mixc(c, "#ffffff", 0.2 + 0.3 * h.node.age));
      const w = (s, L) => h.w0 * (1 - 0.82 * smooth(s / L));
      tissue += `<path d="${ribbon(h.pts, w)}" fill="url(#${id})"/>`;
    }
    for (const n of G.nodes) {
      const dirs = [];
      for (const p of geo.paths) {
        if (p.parent === n && !p.trunk) dirs.push(headingAt(p.pts, Math.min(p.pts.length - 1, 4)));
        if (p.child === n) dirs.push(headingAt(p.pts, p.pts.length - 2) + Math.PI);
      }
      n.soma = somaPts(n.x, n.y, n.R, dirs, cfg, hash(n.id + ":soma"));
      tissue += `<path d="${closedSmooth(n.soma)}" fill="url(#${rad(col(n.age))})"/>`;
    }
    // legend nodules live in the lit tissue layer too
    const lx = 22, ly = H - 34;
    let legendText = `<text class="on-legend-cap" x="${lx}" y="${ly - 22}">AGE · OLDER → NEWER</text>`;
    for (let i = 0; i < 5; i++) {
      const f = i / 4, R = 6.2 - 1.6 * f, cx = lx + 10 + i * 30, pts = somaPts(cx, ly, R, [], cfg, hash("legend" + i));
      tissue += `<path d="${closedSmooth(pts)}" fill="url(#${rad(col(f))})"/>`;
      if (cfg.halo * f > 0.05) { const id = `${uid}-lh${i}`; grads.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${col(f)}" stop-opacity="${f1(0.55 * cfg.halo * f ** 1.4)}"/><stop offset="1" stop-color="${col(f)}" stop-opacity="0"/></radialGradient>`); glow += `<circle cx="${cx}" cy="${ly}" r="${f1(R * (cfg.haloR[0] + cfg.haloR[1] * f))}" fill="url(#${id})"/>`; }
    }
    const lgFrom = (opts.legend && opts.legend.from) || "older", lgTo = (opts.legend && opts.legend.to) || "newer";
    legendText += `<text class="on-legend-tick" x="${lx + 2}" y="${ly + 22}">${esc(lgFrom)}</text><text class="on-legend-tick" x="${lx + 136}" y="${ly + 22}" text-anchor="end">${esc(lgTo)}</text>` +
      `<text class="on-legend-hint" x="${lx + 160}" y="${ly + 4}">${esc(cfg.legendHint)}</text>`;
    // details over the tissue: growing-tip sparks
    let detail = "";
    for (const n of G.nodes) {
      if (cfg.tipSpark && n.age > 0.6) {
        const t = cfg.tipSpark * (n.age - 0.6) / 0.4;
        detail += `<circle cx="${f1(n.x - n.R * 0.25)}" cy="${f1(n.y - n.R * 0.3)}" r="${f1(1 + n.R * 0.16)}" fill="#ffffff" opacity="${f1(0.2 + 0.35 * t)}" filter="url(#${uid}-soft)"/>`;
      }
    }
    if (cfg.tipSpark) for (const h of geo.hairs) if (h.node.age > 0.7) detail += `<circle cx="${f1(h.tip.x)}" cy="${f1(h.tip.y)}" r="${f1(0.9 + h.node.age * 0.6)}" fill="${mixc(col(1), "#ffffff", 0.5)}" opacity="${f1(0.4 * cfg.tipSpark + 0.3 * h.node.age)}" filter="url(#${uid}-soft)"/>`;
    // interactive overlay: invisible hit areas + labels
    const halo = cfg.labelHalo;
    let over = "";
    for (const n of G.nodes) {
      const L = n.lab, hub = !n.depth, active = opts.activeId === n.id;
      const ring = active ? `<path class="on-active" d="${closedSmooth(n.soma.map((q) => ({ x: n.x + (q.x - n.x) * 1.32, y: n.y + (q.y - n.y) * 1.32 })))}" fill="none" stroke="${mixc(col(1), "#ffffff", 0.4)}" stroke-width="1.3" stroke-dasharray="3 3"/>` : "";
      over += `<g class="node on-node${hub ? " hub" : ""}${active ? " active" : ""}" tabindex="0" role="button" data-id="${esc(n.id)}" data-depth="${n.depth}"><title>${esc(n.label)}${n.date ? " · " + esc(n.date) : ""}</title>${ring}` +
        `<circle class="on-hit" cx="${f1(n.x)}" cy="${f1(n.y)}" r="${f1(Math.max(n.R * 1.5, 14))}" fill="transparent"/>` +
        `<text class="on-label ${hub ? "node-label-root" : "node-label-child"}" x="${f1(L.x)}" y="${f1(L.y)}" text-anchor="${L.anchor}" style="font-size:${n.fs}px;font-weight:${n.fw};paint-order:stroke;stroke:var(--on-label-halo, ${halo});stroke-width:4px;stroke-linejoin:round">${esc(n.label)}</text></g>`;
    }
    const svg = `<defs>${filters(cfg, uid)}${grads.join("")}</defs>` +
      `<g class="on-back" pointer-events="none">${back}</g><g class="on-glow" pointer-events="none">${glow}</g><g class="on-links" pointer-events="none">${links}</g>` +
      `<g class="on-tissue" pointer-events="none" filter="url(#${uid}-tissue)">${tissue}</g>` +
      `<g class="on-detail" pointer-events="none">${detail}</g><g class="on-overlay">${over}</g><g class="on-legend" pointer-events="none">${legendText}</g>`;
    return { svg, model: { cfg, nodes: G.nodes, paths: geo.paths, stats: Object.assign({ layoutSeed: best.s, score: Math.round(best.score), tangle: Math.round(best.tangle) }, best.lab), width: W, height: H } };
  }
  function render(svgEl, graph, opts) {
    opts = opts || {};
    const { svg, model } = build(graph, opts);
    svgEl.setAttribute("viewBox", `0 0 ${model.width} ${model.height}`);
    svgEl.setAttribute("width", model.width); svgEl.setAttribute("height", model.height);
    svgEl.style.aspectRatio = `${model.width} / ${model.height}`;
    svgEl.setAttribute("data-layout", "organic");
    svgEl.innerHTML = svg;
    if (opts.onSelect) svgEl.querySelectorAll(".on-node").forEach((el) => {
      const id = el.getAttribute("data-id");
      el.addEventListener("click", () => opts.onSelect(id));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onSelect(id); } });
    });
    svgEl.__organic = model;
    return model;
  }

  root.OrganicNet = { CONFIG, build, render };
})(typeof window !== "undefined" ? window : globalThis);
