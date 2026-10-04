const DEFAULT_SKIN = "spores";
const SKINS = {
  spores: { edges: "mold", nodes: "hyphal-tip", glow: true, dashed: false },
};

const DEFAULT_LOOK = "current";
const LOOK_STORAGE_KEY = "loom-look";

const DEFAULT_FORK_STYLE = "ribbon";
/** Ribbon hyphae: soft tapered stroke, gentle S-curves. */
const FORK_STYLES = {
  ribbon: {
    ampScale: 0.32,
    midScale: 0.28,
    peelScale: 0.72,
    microScale: 0.12,
    sheath: "soft",
    midLayer: true,
    maxWhiskers: 0,
    whiskerTiny: false,
    anastomoses: false,
    jitter: 0,
  },
};

let projectsCache = [];
let activeId = null;
let showAllCards = false;
let orientMode = "horizontal";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function currentSkin() {
  return document.documentElement.getAttribute("data-skin") || DEFAULT_SKIN;
}

function skinOpts() {
  return SKINS[currentSkin()] || SKINS[DEFAULT_SKIN];
}

function currentForkStyle() {
  return document.documentElement.getAttribute("data-fork-style") || DEFAULT_FORK_STYLE;
}

function forkOpts() {
  return FORK_STYLES[currentForkStyle()] || FORK_STYLES[DEFAULT_FORK_STYLE];
}

function parseTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1);
}

function preferredOrient() {
  return window.matchMedia("(max-width: 720px)").matches ? "vertical" : "horizontal";
}

/** Position along the time axis. Same dates stay ordered; real gaps get extra room. */
function timePositions(times, start, end) {
  const n = times.length;
  if (n <= 1) return [(start + end) / 2];
  const usable = Math.max(1, end - start);
  const even = () => Array.from({ length: n }, (_, i) => start + (i * usable) / (n - 1));
  const deltas = [];
  for (let i = 1; i < n; i++) {
    const a = times[i - 1];
    const b = times[i];
    deltas.push(Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : 0);
  }
  const maxD = Math.max(0, ...deltas);
  const minGap = Math.min(164, usable / (n - 1));
  const minTotal = minGap * (n - 1);
  if (maxD === 0 || minTotal >= usable - 0.5) return even();
  const extra = usable - minTotal;
  const weights = deltas.map((d) => d / maxD);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const pos = [start];
  for (let i = 0; i < n - 1; i++) pos.push(pos[i] + minGap + extra * (weights[i] / sum));
  return pos;
}

function layout(projects, orient) {
  const vertical = orient === "vertical";
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const children = {};
  for (const p of projects) {
    const parent = p.parent && byId[p.parent] ? p.parent : null;
    if (!children[parent]) children[parent] = [];
    children[parent].push(p);
  }
  for (const k of Object.keys(children)) {
    children[k].sort((a, b) => String(a.started || "9999").localeCompare(String(b.started || "9999"))
      || String(a.id).localeCompare(String(b.id)));
  }

  const depthOf = (id, guard = 0) => {
    if (guard > 16) return 0;
    const p = byId[id];
    if (!p || !p.parent || !byId[p.parent]) return 0;
    return 1 + depthOf(p.parent, guard + 1);
  };
  const side = {};
  const depth = {};
  for (const p of projects) depth[p.id] = depthOf(p.id);
  for (const p of projects) if (!depth[p.id]) side[p.id] = 0;
  // Horizontal: alternate above/below spine. Vertical: stack short forks to the right.
  for (const p of projects) {
    (children[p.id] || []).forEach((kid, idx) => {
      if (vertical) {
        // Prefer a short fork: share lane 1; collision pass bumps if too close in time.
        if (!depth[p.id]) side[kid.id] = 1;
        else side[kid.id] = (side[p.id] || 1) + 1;
      } else if (!depth[p.id]) {
        side[kid.id] = idx % 2 === 0 ? -1 : 1;
      } else {
        const ps = side[p.id] || -1;
        const dir = Math.sign(ps) || -1;
        side[kid.id] = dir * (Math.abs(ps) + 1);
      }
    });
  }

  const items = projects.map((p) => ({
    ...p,
    t: parseTime(p.started),
    depth: depth[p.id] || 0,
    side: side[p.id] || 0,
  }));
  items.sort((a, b) => {
    const ta = a.t == null ? Infinity : a.t;
    const tb = b.t == null ? Infinity : b.t;
    return ta - tb || a.depth - b.depth || String(a.id).localeCompare(String(b.id));
  });

  const n = items.length;
  const w = vertical ? 560 : 1040;
  const mainStart = vertical ? 58 : 128;
  const mainEnd = vertical ? Math.max(mainStart + 80, 36 + Math.max(0, n - 1) * 122) : w - 86;
  const mains = timePositions(items.map((it) => (it.t == null ? NaN : it.t)), mainStart, mainEnd);

  const minSep = vertical ? 100 : 148;
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < i; j++) {
      if (items[j].side !== items[i].side) continue;
      if (Math.abs(mains[j] - mains[i]) >= minSep) continue;
      if (vertical) items[i].side = Math.abs(items[i].side) + 1;
      else {
        const dir = items[i].side === 0 ? -1 : Math.sign(items[i].side);
        items[i].side = dir * (Math.abs(items[i].side) + 1);
      }
    }
  }

  const crossOf = (s) => {
    if (!s) return 0;
    const mag = Math.abs(s);
    if (vertical) return mag * 118; // lanes always to the right of the spine
    if (s < 0) return -(78 + (mag - 1) * 74);
    return 96 + (mag - 1) * 76;
  };

  let maxUp = 64;
  let maxDown = 64;
  let maxRight = 210;
  for (const item of items) {
    const c = Math.abs(crossOf(item.side));
    if (vertical) maxRight = Math.max(maxRight, crossOf(item.side) + 210);
    else if (item.side < 0) maxUp = Math.max(maxUp, c + 46);
    else if (item.side > 0) maxDown = Math.max(maxDown, c + 44);
    else maxUp = Math.max(maxUp, 50);
  }

  const spine = vertical ? 40 : Math.round(maxUp + 16);
  const h = vertical ? Math.round(mainEnd + 46) : Math.round(spine + maxDown + 26);
  const width = vertical ? Math.round(spine + maxRight) : w;

  const nodes = items.map((item, i) => {
    const off = crossOf(item.side);
    const x = vertical ? spine + off : mains[i];
    const y = vertical ? mains[i] : spine + off;
    return { ...item, x, y, main: mains[i], spine, vertical };
  });

  return { w: width, h, spine, vertical, nodes, byId: Object.fromEntries(nodes.map((nd) => [nd.id, nd])) };
}

function orthoFork(p, c, vertical) {
  if (!vertical) {
    if (Math.abs(p.x - c.x) < 6) return `M ${p.x} ${p.y} L ${c.x} ${c.y}`;
    if (p.side === 0) {
      const dir = Math.sign(c.y - p.y) || -1;
      const rail = p.y + dir * 13;
      return `M ${p.x} ${p.y} L ${p.x} ${rail} L ${c.x} ${rail} L ${c.x} ${c.y}`;
    }
    if (Math.sign(p.side) === Math.sign(c.side)) {
      return `M ${p.x} ${p.y} L ${c.x} ${p.y} L ${c.x} ${c.y}`;
    }
    const rail = p.spine;
    return `M ${p.x} ${p.y} L ${p.x} ${rail} L ${c.x} ${rail} L ${c.x} ${c.y}`;
  }
  if (Math.abs(p.y - c.y) < 6) return `M ${p.x} ${p.y} L ${c.x} ${c.y}`;
  if (p.side === 0) {
    const rail = p.x + 12;
    return `M ${p.x} ${p.y} L ${rail} ${p.y} L ${rail} ${c.y} L ${c.x} ${c.y}`;
  }
  return `M ${p.x} ${p.y} L ${c.x} ${p.y} L ${c.x} ${c.y}`;
}

function curveFork(p, c, vertical) {
  if (!vertical) {
    if (p.side === 0) {
      const dir = Math.sign(c.y - p.y) || -1;
      const rail = p.y + dir * 16;
      return `M ${p.x} ${p.y} C ${p.x} ${rail}, ${c.x} ${rail}, ${c.x} ${c.y}`;
    }
    const mx = (p.x + c.x) / 2;
    return `M ${p.x} ${p.y} C ${mx} ${p.y}, ${mx} ${c.y}, ${c.x} ${c.y}`;
  }
  if (p.side === 0) {
    const rail = p.x + 16;
    return `M ${p.x} ${p.y} C ${rail} ${p.y}, ${rail} ${c.y}, ${c.x} ${c.y}`;
  }
  const my = (p.y + c.y) / 2;
  return `M ${p.x} ${p.y} C ${p.x} ${my}, ${c.x} ${my}, ${c.x} ${c.y}`;
}

function edgePath(p, c, mode, vertical) {
  if (mode === "mold") return moldFork(p, c, vertical);
  return mode === "ortho" ? orthoFork(p, c, vertical) : curveFork(p, c, vertical);
}

function fmt(n) {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? "0" : String(v);
}

/** FNV-1a → uint32. Same project id always yields the same meander. */
function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Open curve through pts. Catmull-Rom-ish beziers with tight tension (÷6)
 * so the hypha follows samples instead of looping back across the time spine.
 */
function moldSmooth(pts) {
  if (!pts || pts.length < 2) return "";
  const d = [`M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
  }
  return d.join(" ");
}

function moldLerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Sample a point + unit tangent along a polyline (t in [0,1]). */
function moldSample(pts, t) {
  if (pts.length < 2) return { x: pts[0].x, y: pts[0].y, tx: 1, ty: 0 };
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) || 1e-6;
    segLens.push(len);
    total += len;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const u = target / segLens[i];
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const inv = 1 / (Math.hypot(dx, dy) || 1);
      return { x: a.x + dx * u, y: a.y + dy * u, tx: dx * inv, ty: dy * inv };
    }
    target -= segLens[i];
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const inv = 1 / (Math.hypot(dx, dy) || 1);
  return { x: last.x, y: last.y, tx: dx * inv, ty: dy * inv };
}

/**
 * Build the main hypha point chain: peel off the straight time spine, then
 * meander. Amplitude / sample density / jitter come from fork style.
 * Seeded from child project id. Nested sibling lanes stay quieter.
 */
function moldHyphaPoints(p, c, vertical, rnd, style) {
  const st = style || FORK_STYLES[DEFAULT_FORK_STYLE];
  const nested = (p.side || 0) !== 0;
  const spine = p.spine ?? (vertical ? p.x : p.y);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ampScale = st.ampScale ?? 1;
  const midScale = st.midScale ?? 1;
  const peelScale = st.peelScale ?? 1;
  const microScale = st.microScale ?? 1;
  const pointJitter = st.jitter ?? 0;

  let outX = 0;
  let outY = 0;
  if (vertical) outX = Math.sign(c.x - spine) || 1;
  else outY = Math.sign(c.y - spine) || Math.sign(c.side) || -1;

  // Peel off the spine before wandering. Downward forks clear the date labels.
  let peel = 0;
  if (!nested) peel = vertical ? 28 : (outY > 0 ? 46 : 26);
  peel = Math.min(peel * peelScale, dist * 0.4);
  const ampBase = nested
    ? Math.min(10, 4.5 + dist * 0.032)
    : Math.min(30, 13 + dist * 0.032);
  const amp = ampBase * ampScale;

  const pts = [{ x: p.x, y: p.y }];
  const latX = vertical ? 0 : 1;
  const latY = vertical ? 1 : 0;
  if (peel > 6) {
    // Calm/ribbon: fewer peel waypoints → smoother organic leave.
    const peelSteps = midScale < 0.4 ? 2 : midScale < 0.55 ? 3 : 4;
    const j1 = (rnd() * 2 - 1) * Math.min(9, amp * 0.48);
    const j2 = (rnd() * 2 - 1) * Math.min(7, amp * 0.32);
    if (peelSteps <= 2) {
      pts.push({
        x: p.x + outX * peel * 0.45 + latX * j1 * 0.5,
        y: p.y + outY * peel * 0.45 + latY * j1 * 0.5,
      });
      pts.push({
        x: p.x + outX * peel + latX * j2 * 0.35,
        y: p.y + outY * peel + latY * j2 * 0.35,
      });
    } else if (peelSteps === 3) {
      pts.push({
        x: p.x + outX * peel * 0.35 + latX * j1,
        y: p.y + outY * peel * 0.35 + latY * j1,
      });
      pts.push({
        x: p.x + outX * peel * 0.72 + latX * j2 * 0.45,
        y: p.y + outY * peel * 0.72 + latY * j2 * 0.45,
      });
      pts.push({
        x: p.x + outX * peel + latX * j2 * 0.4,
        y: p.y + outY * peel + latY * j2 * 0.4,
      });
    } else {
      pts.push({
        x: p.x + outX * peel * 0.32 + latX * j1,
        y: p.y + outY * peel * 0.32 + latY * j1,
      });
      pts.push({
        x: p.x + outX * peel * 0.62 + latX * j2 * 0.4,
        y: p.y + outY * peel * 0.62 + latY * j2 * 0.4,
      });
      pts.push({
        x: p.x + outX * peel * 0.88 + latX * j2,
        y: p.y + outY * peel * 0.88 + latY * j2,
      });
      pts.push({
        x: p.x + outX * peel + latX * j2 * 0.55,
        y: p.y + outY * peel + latY * j2 * 0.55,
      });
    }
  }

  const ax = pts[pts.length - 1].x;
  const ay = pts[pts.length - 1].y;
  const ex = c.x - ax;
  const ey = c.y - ay;
  const el = Math.hypot(ex, ey) || 1;
  const pxn = -ey / el;
  const pyn = ex / el;
  const ox = vertical ? outX : 0;
  const oy = vertical ? 0 : outY;
  const denseMid = el < 70 ? 3 : el < 140 ? 5 : el < 240 ? 7 : el < 380 ? 9 : 11;
  const nMid = Math.max(2, Math.round(denseMid * midScale));
  let prevT = 0.04;
  for (let i = 1; i <= nMid; i++) {
    const t = i / (nMid + 1);
    const jitter = (rnd() - 0.5) * (0.06 + 0.04 * midScale);
    const tt = Math.min(0.94, Math.max(prevT + 0.05, t + jitter));
    prevT = tt;
    const taper = Math.sin(Math.PI * tt);
    // Ribbon uses a low midScale, so the meander stays a gentle S-curve.
    const flipChance = midScale > 0.55 ? 0.18 : 0.06;
    const side = (i % 2 === 0 ? 1 : -1) * (rnd() < flipChance ? -1 : 1);
    const gain = midScale > 0.55 ? (0.35 + rnd() * 0.9) : (0.45 + rnd() * 0.45);
    const micro = (rnd() * 2 - 1) * amp * 0.22 * taper * microScale;
    const w = side * gain * amp * taper + micro;
    const outwardBoost = (0.1 + rnd() * 0.42) * amp * taper * (nested ? 0.18 : 1) * Math.min(1, ampScale + 0.2);
    let x = ax + ex * tt + pxn * w + ox * outwardBoost;
    let y = ay + ey * tt + pyn * w + oy * outwardBoost;
    if (!nested && !vertical) {
      if (outY < 0) y = Math.min(y, spine - 7);
      else y = Math.max(y, spine + 44);
    } else if (!nested && vertical) {
      x = Math.max(x, spine + 10);
    }
    pts.push({ x, y });
  }
  pts.push({ x: c.x, y: c.y });

  // Paper-pen jitter for ink-etched (skip endpoints so nodes stay clean).
  if (pointJitter > 0 && pts.length > 2) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i] = {
        x: pts[i].x + (rnd() * 2 - 1) * pointJitter,
        y: pts[i].y + (rnd() * 2 - 1) * pointJitter,
      };
    }
  }
  return { pts, nested, amp, el, outX, outY, spine };
}

/**
 * Decorative side-whiskers: short secondary filaments that die out and never
 * land on a node (no fake terminals). Seeded from the same RNG stream.
 */
function moldWhiskers(pts, rnd, nested, amp, style) {
  const out = [];
  if (pts.length < 4) return out;
  const maxW = style && Number.isFinite(style.maxWhiskers) ? style.maxWhiskers : 0;
  if (maxW <= 0) return out;
  const tiny = !!(style && style.whiskerTiny);
  // Sparse: at most 1–2 tiny whiskers. Nested lanes stay quieter.
  let count;
  if (tiny) {
    count = nested ? (rnd() < 0.35 ? 1 : 0) : (1 + (rnd() < 0.45 ? 1 : 0));
    count = Math.min(count, maxW);
  } else {
    count = nested ? Math.min(maxW, 1 + (rnd() < 0.5 ? 1 : 0)) : Math.min(maxW, 2 + Math.floor(rnd() * 2));
  }
  for (let i = 0; i < count; i++) {
    const t = 0.18 + rnd() * 0.58;
    const s = moldSample(pts, t);
    const nx = -s.ty;
    const ny = s.tx;
    const side = rnd() < 0.5 ? 1 : -1;
    const len = tiny
      ? ((nested ? 4 : 5) + rnd() * (nested ? 5 : 7))
      : ((nested ? 6 : 9) + rnd() * (nested ? 9 : 16));
    const bend = (rnd() * 2 - 1) * (tiny ? 0.22 : 0.35);
    const mid = {
      x: s.x + nx * side * len * 0.55 + s.tx * bend * len,
      y: s.y + ny * side * len * 0.55 + s.ty * bend * len,
    };
    const tip = {
      x: s.x + nx * side * len + s.tx * bend * len * 1.4,
      y: s.y + ny * side * len + s.ty * bend * len * 1.4,
    };
    out.push(moldSmooth([{ x: s.x, y: s.y }, mid, tip]));
  }
  return out;
}

/**
 * Anastomosing loops: leave the main hypha and rejoin further along it.
 * Decorative only — no extra graph nodes. Keeps the mesh/mycelium feel.
 */
function moldAnastomoses(pts, rnd, nested, amp, style) {
  const out = [];
  if (nested || pts.length < 5) return out;
  if (style && style.anastomoses === false) return out;
  const n = rnd() < 0.72 ? 1 : (rnd() < 0.45 ? 2 : 0);
  for (let i = 0; i < n; i++) {
    const t0 = 0.22 + rnd() * 0.28;
    const span = 0.14 + rnd() * 0.2;
    const t1 = Math.min(0.88, t0 + span);
    const a = moldSample(pts, t0);
    const b = moldSample(pts, t1);
    const nx = -(a.ty + b.ty) * 0.5;
    const ny = (a.tx + b.tx) * 0.5;
    const nlen = Math.hypot(nx, ny) || 1;
    const side = rnd() < 0.5 ? 1 : -1;
    const bulge = (0.55 + rnd() * 0.85) * Math.min(amp * 0.95, 22);
    const midT = 0.35 + rnd() * 0.3;
    const midBase = moldLerpPt(
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      midT
    );
    const loop = [
      { x: a.x, y: a.y },
      {
        x: a.x + (nx / nlen) * side * bulge * 0.55 + a.tx * span * 12,
        y: a.y + (ny / nlen) * side * bulge * 0.55 + a.ty * span * 12,
      },
      {
        x: midBase.x + (nx / nlen) * side * bulge,
        y: midBase.y + (ny / nlen) * side * bulge,
      },
      {
        x: b.x + (nx / nlen) * side * bulge * 0.4 - b.tx * span * 8,
        y: b.y + (ny / nlen) * side * bulge * 0.4 - b.ty * span * 8,
      },
      { x: b.x, y: b.y },
    ];
    out.push(moldSmooth(loop));
  }
  return out;
}

/**
 * Organic fork from parent → child. Ribbon geometry, seeded from the child id.
 */
function moldForkBundle(p, c, vertical) {
  const style = forkOpts();
  const rnd = mulberry32(hashSeed(String(c.id || "")));
  const { pts, nested, amp } = moldHyphaPoints(p, c, vertical, rnd, style);
  const main = moldSmooth(pts);
  const whiskers = moldWhiskers(pts, rnd, nested, amp, style);
  const anastomoses = moldAnastomoses(pts, rnd, nested, amp, style);
  return {
    main,
    whiskers,
    anastomoses,
    nested,
    sheath: style.sheath || "none",
    midLayer: !!style.midLayer,
  };
}

function moldFork(p, c, vertical) {
  return moldForkBundle(p, c, vertical).main;
}

function nodeShape(n, kind) {
  const r = 8;
  const glow = skinOpts().glow ? ' filter="url(#glow)"' : "";
  if (kind === "rect") {
    const s = 13;
    return `<rect class="orb" x="${n.x - s / 2}" y="${n.y - s / 2}" width="${s}" height="${s}"/>`;
  }
  if (kind === "diamond") {
    const s = r + 2;
    return `<polygon class="orb" points="${n.x},${n.y - s} ${n.x + s},${n.y} ${n.x},${n.y + s} ${n.x - s},${n.y}"/>`;
  }
  /* Soft glowing junction — mycelium night / fluorescence */
  if (kind === "glow-dot") {
    const rnd = mulberry32(hashSeed(String(n.id || "")));
    const core = 5.2 + rnd() * 1.8;
    const halo = core + 3.8 + rnd() * 1.6;
    return `<circle class="orb orb-halo" cx="${n.x}" cy="${n.y}" r="${fmt(halo)}"${glow}/>` +
      `<circle class="orb" cx="${n.x}" cy="${n.y}" r="${fmt(core)}"${glow}/>`;
  }
  /* Irregular culture nodule — agar plate (seeded ellipse + soft lobe) */
  if (kind === "nodule") {
    const rnd = mulberry32(hashSeed(String(n.id || "")));
    const rx = 5.2 + rnd() * 2.8;
    const ry = 4.1 + rnd() * 2.4;
    const rot = Math.floor(rnd() * 70 - 35);
    const lobeR = 2.4 + rnd() * 1.6;
    const ang = rnd() * Math.PI * 2;
    const lx = n.x + Math.cos(ang) * (rx * 0.55);
    const ly = n.y + Math.sin(ang) * (ry * 0.55);
    return `<ellipse class="orb" cx="${n.x}" cy="${n.y}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${rot} ${n.x} ${n.y})"/>` +
      `<circle class="orb orb-lobe" cx="${fmt(lx)}" cy="${fmt(ly)}" r="${fmt(lobeR)}"/>`;
  }
  /* Small hyphal tip — spores (soft core + tapered tip) */
  if (kind === "hyphal-tip") {
    const rnd = mulberry32(hashSeed(String(n.id || "")));
    const core = 4.6 + rnd() * 1.4;
    const ang = rnd() * Math.PI * 2;
    const tipLen = 7 + rnd() * 4;
    const tx = n.x + Math.cos(ang) * tipLen;
    const ty = n.y + Math.sin(ang) * tipLen;
    const midX = n.x + Math.cos(ang) * tipLen * 0.55 + Math.cos(ang + 1.2) * 1.4;
    const midY = n.y + Math.sin(ang) * tipLen * 0.55 + Math.sin(ang + 1.2) * 1.4;
    return `<circle class="orb" cx="${n.x}" cy="${n.y}" r="${fmt(core)}"${glow}/>` +
      `<path class="orb orb-tip" d="M ${fmt(n.x)} ${fmt(n.y)} Q ${fmt(midX)} ${fmt(midY)} ${fmt(tx)} ${fmt(ty)}"${glow}/>`;
  }
  return `<circle class="orb" cx="${n.x}" cy="${n.y}" r="${r}"${glow}/>`;
}

function nodeLabel(n, opts) {
  const label = escapeHtml(n.title || "");
  const vertical = n.vertical;
  if (vertical) {
    const tx = n.x + 16;
    if (opts.stamp) {
      const tw = Math.min(188, Math.max(36, (n.title || "").length * 6.15 + 10));
      const th = 14;
      const ty = n.y - th / 2 - 7;
      return `<g class="stamp-label">
        <rect class="stamp" x="${tx}" y="${ty}" width="${tw}" height="${th}"/>
        <text x="${tx + 5}" y="${ty + 10.5}" text-anchor="start">${label}</text>
      </g>`;
    }
    return `<text x="${tx}" y="${n.y - 2}" text-anchor="start">${label}</text>`;
  }
  const outward = n.side === 0 ? -1 : Math.sign(n.side);
  if (opts.stamp) {
    const tw = Math.max(36, (n.title || "").length * 6.15 + 10);
    const th = 14;
    const tx = n.x - tw / 2;
    const tyBox = outward < 0 ? n.y - (n.side === 0 ? 36 : 28) : n.y + 14;
    return `<g class="stamp-label">
      <rect class="stamp" x="${tx}" y="${tyBox}" width="${tw}" height="${th}"/>
      <text x="${n.x}" y="${tyBox + 10.5}" text-anchor="middle">${label}</text>
    </g>`;
  }
  const ty = outward < 0 ? n.y - (n.side === 0 ? 18 : 16) : n.y + 22;
  return `<text x="${n.x}" y="${ty}" text-anchor="middle">${label}</text>`;
}


function arrowPoints(spine, vertical, x1, y1, x2, y2) {
  if (!vertical) {
    const x = x2;
    const y = spine;
    return `${x},${y} ${x - 11},${y - 4.5} ${x - 11},${y + 4.5}`;
  }
  const x = spine;
  const y = y2;
  return `${x},${y} ${x - 4.5},${y - 11} ${x + 4.5},${y - 11}`;
}

function renderGraph(projects) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  orientMode = preferredOrient();
  const { w, h, spine, vertical, nodes, byId } = layout(projects, orientMode);
  const opts = skinOpts();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.style.aspectRatio = `${w} / ${h}`;
  svg.setAttribute("data-edge-mode", opts.edges);
  svg.setAttribute("data-orient", vertical ? "vertical" : "horizontal");
  svg.setAttribute("data-fork-style", currentForkStyle());

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const spineStart = vertical
    ? { x: spine, y: (first ? first.main : 40) - 28 }
    : { x: (first ? first.main : 80) - 78, y: spine };
  const spineEnd = vertical
    ? { x: spine, y: (last ? last.main : h - 30) + 26 }
    : { x: (last ? last.main : w - 40) + 34, y: spine };

  const dash = opts.dashed ? ' stroke-dasharray="6 4"' : "";
  const glowFilter = opts.glow
    ? `<filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";

  const defs = `<defs>
    <linearGradient id="spineGrad" x1="${vertical ? 0 : 0}" y1="${vertical ? 0 : 0}" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">
      <stop offset="0%" stop-color="var(--spine)" stop-opacity="0.35"/>
      <stop offset="18%" stop-color="var(--spine)"/>
      <stop offset="100%" stop-color="var(--spine)"/>
    </linearGradient>
    ${glowFilter}
  </defs>`;

  const cap = opts.edges === "ortho" ? "square" : "round";
  const spineLine = `<line class="spine-line" x1="${spineStart.x}" y1="${spineStart.y}" x2="${spineEnd.x}" y2="${spineEnd.y}"
    stroke="url(#spineGrad)" stroke-linecap="${cap}"${dash}/>`;
  const arrow = `<polygon class="spine-arrow" points="${arrowPoints(spine, vertical, spineStart.x, spineStart.y, spineEnd.x, spineEnd.y)}"/>`;

  const caption = vertical
    ? `<text class="axis-caption" x="${spine}" y="${Math.max(14, spineStart.y - 8)}" text-anchor="middle">TIME</text>`
    : `<text class="axis-caption" x="${Math.max(8, spineStart.x)}" y="${spine - 12}" text-anchor="start">TIME</text>`;

  // One tick + date label per distinct started value (chronology, not per node).
  const chronos = [];
  const seenDate = new Set();
  for (const n of nodes) {
    const key = n.started || "—";
    if (seenDate.has(key)) continue;
    seenDate.add(key);
    chronos.push(n);
  }
  const ticks = chronos.map((n) => {
    if (vertical) {
      return `<line class="tick" x1="${spine - 4}" y1="${n.main}" x2="${spine + 4}" y2="${n.main}"/>`;
    }
    return `<line class="tick" x1="${n.main}" y1="${spine - 4}" x2="${n.main}" y2="${spine + 4}"/>`;
  }).join("");

  const dates = chronos.map((n) => {
    const date = escapeHtml(n.started || "—");
    if (vertical) {
      return `<text class="tick-label" x="${spine - 8}" y="${n.main + 3}" text-anchor="end">${date}</text>`;
    }
    return `<text class="tick-label" x="${n.main}" y="${spine + 30}" text-anchor="middle">${date}</text>`;
  }).join("");

  const branches = nodes.filter((n) => n.parent && byId[n.parent]).map((n) => {
    const parent = byId[n.parent];
    const filt = opts.glow ? ' filter="url(#glow)"' : "";
    if (opts.edges === "mold") {
      const bundle = moldForkBundle(parent, n, vertical);
      const d = bundle.main;
      // Ribbon: soft sheath and a quieter mid taper. No whiskers.
      let layers = "";
      if (bundle.sheath === "soft") {
        layers += `<path class="edge mold-sheath" d="${d}" pathLength="100" stroke-dasharray="40 64"/>`;
        if (bundle.midLayer) {
          layers += `<path class="edge mold-mid" d="${d}" pathLength="100" stroke-dasharray="68 36"/>`;
        }
      } else if (bundle.sheath === "thin") {
        layers += `<path class="edge mold-sheath mold-sheath-thin" d="${d}" pathLength="100" stroke-dasharray="36 70"/>`;
      }
      const core = `<path class="edge mold-core" d="${d}"${dash}${filt}/>`;
      const loops = bundle.anastomoses.map((ad) =>
        `<path class="edge mold-anas" d="${ad}"/>`
      ).join("");
      const whisk = bundle.whiskers.map((wd) =>
        `<path class="edge mold-whisker" d="${wd}"/>`
      ).join("");
      return loops + layers + core + whisk;
    }
    const d = edgePath(parent, n, opts.edges, vertical);
    return `<path class="edge" d="${d}"${dash}${filt}/>`;
  }).join("");

  const dots = nodes.map((n) => {
    const hard = opts.edges === "ortho";
    // Mold forks already leave the spine; a time-peg under the node would read as an ortho stub.
    const anchor = opts.edges === "mold" || n.side === 0
      ? ""
      : (vertical
        ? (hard
          ? `<rect class="anchor" x="${spine - 2.5}" y="${n.y - 2.5}" width="5" height="5"/>`
          : `<circle class="anchor" cx="${spine}" cy="${n.y}" r="3"/>`)
        : (hard
          ? `<rect class="anchor" x="${n.x - 2.5}" y="${spine - 2.5}" width="5" height="5"/>`
          : `<circle class="anchor" cx="${n.x}" cy="${spine}" r="3"/>`));
    return `<g class="node" tabindex="0" role="button" data-id="${escapeHtml(n.id)}">
      <title>${escapeHtml(n.title || "")} · ${escapeHtml(n.started || "undated")}</title>
      ${anchor}
      ${nodeShape(n, opts.nodes)}
      ${nodeLabel(n, opts)}
    </g>`;
  }).join("");

  svg.innerHTML = defs + spineLine + arrow + ticks + dates + caption + branches + dots;
  svg.querySelectorAll(".node").forEach((el) => {
    const id = el.getAttribute("data-id");
    const focus = () => {
      if (activeId === id) {
        activeId = null;
        syncCards(false);
        return;
      }
      selectNode(id);
    };
    el.addEventListener("click", focus);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        focus();
      }
    });
  });
  syncCards(false);
}

/** Cards stay hidden until a node is chosen, or until every card is shown.
 * Choosing the active node again clears the selection and hides its card. */
function syncCards(scroll) {
  const toggle = document.getElementById("cards-toggle");
  if (toggle) {
    toggle.textContent = showAllCards ? "Hide node cards" : "Show all node cards";
    toggle.setAttribute("aria-pressed", showAllCards ? "true" : "false");
  }
  document.querySelectorAll(".node").forEach((n) => {
    n.classList.toggle("active", activeId != null && n.getAttribute("data-id") === activeId);
  });
  let scrolled = false;
  document.querySelectorAll(".card").forEach((c) => {
    const id = c.getAttribute("data-id");
    const selected = activeId != null && id === activeId;
    const visible = showAllCards || selected;
    c.classList.toggle("active", selected);
    c.hidden = !visible;
    if (visible && selected && scroll && !scrolled) {
      c.scrollIntoView({ behavior: "smooth", block: "nearest" });
      scrolled = true;
    }
  });
}

function selectNode(id) {
  if (!id) return;
  activeId = id;
  syncCards(true);
}

function toggleAllCards() {
  showAllCards = !showAllCards;
  if (!showAllCards) activeId = null;
  syncCards(false);
}

function renderCards(projects) {
  const root = document.getElementById("cards");
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const sorted = [...projects].sort((a, b) =>
    String(b.started || "").localeCompare(String(a.started || ""))
  );
  root.innerHTML = sorted.map((p) => {
    const when = p.ended ? `${p.started || "?"} → ${p.ended}` : (p.started || "ongoing");
    const tags = (p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const parentTitle = p.parent && byId[p.parent] ? byId[p.parent].title : null;
    const fork = parentTitle
      ? `<div class="fork">fork of ${escapeHtml(parentTitle)}</div>`
      : `<div class="fork">on the spine</div>`;
    const selected = activeId != null && p.id === activeId;
    const visible = showAllCards || selected;
    return `<article class="card${selected ? " active" : ""}" id="card-${escapeHtml(p.id || "")}" data-id="${escapeHtml(p.id || "")}"${visible ? "" : " hidden"}>
      <div class="meta">${escapeHtml(when)}</div>
      ${fork}
      <h2>${escapeHtml(p.title || "Untitled")}</h2>
      <p>${escapeHtml(p.summary || "")}</p>
      <div class="tags">${tags}</div>
    </article>`;
  }).join("");
  root.querySelectorAll(".card").forEach((c) => {
    c.addEventListener("click", () => selectNode(c.getAttribute("data-id")));
  });
  syncCards(false);
}

function savedLook() {
  try {
    return localStorage.getItem(LOOK_STORAGE_KEY) === "white" ? "white" : DEFAULT_LOOK;
  } catch (err) {
    return DEFAULT_LOOK;
  }
}

function applyLook(look) {
  const next = look === "white" ? "white" : DEFAULT_LOOK;
  document.documentElement.setAttribute("data-skin", DEFAULT_SKIN);
  document.documentElement.setAttribute("data-fork-style", DEFAULT_FORK_STYLE);
  document.documentElement.setAttribute("data-look", next);
  const toggle = document.getElementById("look-toggle");
  if (!toggle) return;
  toggle.setAttribute("aria-pressed", next === "white" ? "true" : "false");
}

function toggleLook() {
  const next = document.documentElement.getAttribute("data-look") === "white" ? DEFAULT_LOOK : "white";
  try {
    localStorage.setItem(LOOK_STORAGE_KEY, next);
  } catch (err) {
    /* storage unavailable — the look still changes for this view */
  }
  applyLook(next);
}

function lockLook() {
  applyLook(savedLook());
}

async function load() {
  try {
    const res = await fetch("./data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    projectsCache = data.projects || [];
    renderGraph(projectsCache);
    renderCards(projectsCache);
  } catch (err) {
    document.getElementById("cards").innerHTML =
      `<p style="color:var(--muted)">Could not load data (${escapeHtml(String(err))})</p>`;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const about = document.getElementById("about");
    const graph = document.getElementById("graph");
    const cards = document.getElementById("cards");
    const cardsToggle = document.getElementById("cards-toggle");
    if (btn.dataset.tab === "about") {
      about.classList.remove("hidden");
      graph.classList.add("hidden");
      cards.classList.add("hidden");
      cardsToggle.classList.add("hidden");
    } else {
      about.classList.add("hidden");
      graph.classList.remove("hidden");
      cards.classList.remove("hidden");
      cardsToggle.classList.remove("hidden");
    }
  });
});

window.addEventListener("resize", () => {
  const next = preferredOrient();
  if (next !== orientMode && projectsCache.length) renderGraph(projectsCache);
});

document.getElementById("cards-toggle").addEventListener("click", toggleAllCards);
document.getElementById("look-toggle").addEventListener("click", toggleLook);

lockLook();
load();
