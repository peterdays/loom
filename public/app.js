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

/** Visible core size. Roots (parent null) are the large hubs; leaves stay small. */
function nodeCoreRadius(depth, hasKids) {
  if (depth <= 0) return 14;
  if (hasKids) return 7.2;
  return 4.6;
}

/**
 * Full-circle fan with a gap centered up so the hub title has a quiet wedge.
 * n === 1 sits just east of the hub (later work reads forward).
 */
function radialChildAngles(n) {
  if (n <= 0) return [];
  if (n === 1) return [-0.18];
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2 + step / 2;
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/** Nested siblings stay in a narrow cone along the parent's outward ray. */
function coneAngles(base, n) {
  if (n <= 1) return [Number.isFinite(base) ? base : 0];
  const spread = Math.min(1.2, 0.38 * n + 0.2);
  return Array.from({ length: n }, (_, i) => base + ((i / (n - 1)) - 0.5) * spread);
}

function orbitRadius(depth, count, vertical) {
  const crowd = Math.max(0, count - 3) * (vertical ? 12 : 16);
  if (vertical) return (depth === 0 ? 168 : 118) + crowd;
  return (depth === 0 ? 248 : 156) + crowd;
}

/**
 * Place one hub and its descendants in local coordinates.
 * Children radiate outward; a seeded jitter keeps the fan from looking stamped.
 */
function layoutCluster(root, children, byId, vertical) {
  const local = {};
  const kidCount = (children[root.id] || []).length;
  local[root.id] = {
    x: 0,
    y: 0,
    ang: -Math.PI / 2,
    depth: 0,
    r: nodeCoreRadius(0, kidCount > 0),
    childCount: kidCount,
    tipAng: 0.7,
  };

  function place(parentId, depth) {
    const kids = children[parentId] || [];
    const parent = local[parentId];
    const n = kids.length;
    if (!n) return;
    const rad = orbitRadius(depth, n, vertical);
    const angles = depth === 0 ? radialChildAngles(n) : coneAngles(parent.ang, n);
    kids.forEach((kid, i) => {
      const rnd = mulberry32(hashSeed(String(kid.id) + ":orbit"));
      const jitter = n <= 1 ? (rnd() - 0.5) * 0.06 : (rnd() - 0.5) * 0.12;
      const ang = angles[i] + jitter;
      const dist = rad * (0.94 + rnd() * 0.12);
      const d = depth + 1;
      const grand = (children[kid.id] || []).length;
      local[kid.id] = {
        x: parent.x + Math.cos(ang) * dist,
        y: parent.y + Math.sin(ang) * dist,
        ang,
        depth: d,
        r: nodeCoreRadius(d, grand > 0),
        childCount: grand,
        tipAng: ang,
      };
      place(kid.id, d);
    });
    if (depth === 0 && kids[0] && local[kids[0].id]) parent.tipAng = local[kids[0].id].ang;
  }
  place(root.id, 0);

  const ids = Object.keys(local);
  for (let pass = 0; pass < 7; pass++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = local[ids[i]];
        const b = local[ids[j]];
        const minD = a.r + b.r + (Math.min(a.depth, b.depth) === 0 ? 156 : 112);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= minD) continue;
        const push = (minD - dist) * 0.5;
        const ux = dx / dist;
        const uy = dy / dist;
        if (a.depth !== 0) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (b.depth !== 0) {
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
  }
  for (const id of ids) {
    const parentId = byId[id] && byId[id].parent;
    if (!parentId || !local[parentId]) continue;
    const par = local[parentId];
    local[id].ang = Math.atan2(local[id].y - par.y, local[id].x - par.x);
    if (local[id].depth > 0) local[id].tipAng = local[id].ang;
  }
  return local;
}

function shiftTree(local, dx, dy) {
  for (const id of Object.keys(local)) {
    local[id].x += dx;
    local[id].y += dy;
  }
}

/** Extent of a cluster along the chronological axis, including label width. */
function clusterSpan(local, byId, vertical) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const id of Object.keys(local)) {
    const n = local[id];
    const title = (byId[id] && byId[id].title) || "";
    const pad = n.r + (n.depth === 0 ? 36 : 28) + Math.min(210, title.length * 3.4);
    const main = vertical ? n.y : n.x;
    lo = Math.min(lo, main - pad);
    hi = Math.max(hi, main + pad);
  }
  if (!Number.isFinite(lo)) return { lo: 0, hi: 0 };
  return { lo, hi };
}

/**
 * Radial mycelium. Root hubs sit in time order (left→right, or top→bottom
 * when narrow). Hyphae leave each hub in every direction toward its children.
 */
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

  const roots = [...(children[null] || [])].sort((a, b) =>
    String(a.started || "9999").localeCompare(String(b.started || "9999"))
    || String(a.id).localeCompare(String(b.id)));

  const clusters = roots.map((root) => layoutCluster(root, children, byId, vertical));
  let cursor = 0;
  const gap = vertical ? 88 : 96;
  clusters.forEach((local) => {
    const span = clusterSpan(local, byId, vertical);
    const shift = cursor - span.lo;
    if (vertical) shiftTree(local, 0, shift);
    else shiftTree(local, shift, 0);
    const placed = clusterSpan(local, byId, vertical);
    cursor = placed.hi + gap;
  });

  const pos = {};
  clusters.forEach((local) => {
    for (const id of Object.keys(local)) pos[id] = local[id];
  });
  for (const p of projects) {
    if (pos[p.id]) continue;
    const depth = 0;
    pos[p.id] = {
      x: cursor,
      y: vertical ? cursor : 0,
      ang: -Math.PI / 2,
      depth,
      r: nodeCoreRadius(depth, false),
      childCount: 0,
      tipAng: 0.7,
    };
    cursor += 180;
  }

  const nodes = projects.map((p) => {
    const n = pos[p.id];
    return {
      ...p,
      t: parseTime(p.started),
      depth: n.depth,
      r: n.r,
      ang: n.ang,
      tipAng: n.tipAng,
      childCount: n.childCount,
      x: n.x,
      y: n.y,
      vertical,
      side: n.depth === 0 ? 0 : (Math.sin(n.ang) < 0 ? -1 : 1),
    };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const halo = n.depth === 0 ? n.r * 2.5 + 8 : n.r + 10;
    minX = Math.min(minX, n.x - halo);
    maxX = Math.max(maxX, n.x + halo);
    minY = Math.min(minY, n.y - halo);
    maxY = Math.max(maxY, n.y + halo);
    const box = labelBounds(n);
    minX = Math.min(minX, box.left);
    maxX = Math.max(maxX, box.right);
    minY = Math.min(minY, box.top);
    maxY = Math.max(maxY, box.bot);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 640;
    maxY = 480;
  }

  const margin = vertical ? 28 : 36;
  const shiftX = margin - minX;
  const shiftY = margin - minY;
  for (const n of nodes) {
    n.x += shiftX;
    n.y += shiftY;
  }
  const width = Math.max(vertical ? 420 : 720, Math.round(maxX - minX + margin * 2));
  const height = Math.max(vertical ? 520 : 460, Math.round(maxY - minY + margin * 2));

  nodes.sort((a, b) => {
    const ta = a.t == null ? Infinity : a.t;
    const tb = b.t == null ? Infinity : b.t;
    return ta - tb || a.depth - b.depth || String(a.id).localeCompare(String(b.id));
  });

  const rootNodes = nodes.filter((n) => n.depth === 0);
  return {
    w: width,
    h: height,
    vertical,
    nodes,
    rootNodes,
    byId: Object.fromEntries(nodes.map((nd) => [nd.id, nd])),
  };
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
 * Organic hypha from parent hub to child. Leaves the parent rim and arrives
 * at the child rim. Ribbon stays a gentle S-curve; nested links stay quieter.
 * Seeded from the child project id.
 */
function moldHyphaPoints(p, c, vertical, rnd, style) {
  const st = style || FORK_STYLES[DEFAULT_FORK_STYLE];
  const nested = (p.depth || 0) > 0;
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const parentR = Math.min((p.r || 8) + (nested ? 1.5 : 5), dist * 0.34);
  const childR = Math.min((c.r || 5) + 2, dist * 0.22);
  const start = { x: p.x + ux * parentR, y: p.y + uy * parentR };
  const end = { x: c.x - ux * childR, y: c.y - uy * childR };
  const ex = end.x - start.x;
  const ey = end.y - start.y;
  const el = Math.hypot(ex, ey) || 1;
  const pxn = -ey / el;
  const pyn = ex / el;
  const ampScale = st.ampScale ?? 0.32;
  const midScale = st.midScale ?? 0.28;
  const microScale = st.microScale ?? 0.12;
  const pointJitter = st.jitter ?? 0;
  // Gentle radial S. Ribbon's low ampScale keeps it from becoming a dense mesh.
  const amp = (nested ? 9 : 26) * (0.7 + ampScale);
  const denseMid = el < 110 ? 3 : el < 220 ? 4 : 5;
  const nMid = Math.max(2, Math.round(denseMid * (0.75 + midScale)));
  const pts = [{ x: start.x, y: start.y }];
  for (let i = 1; i <= nMid; i++) {
    const t = i / (nMid + 1);
    const taper = Math.sin(Math.PI * t);
    const side = (i % 2 === 0 ? 1 : -1);
    const gain = 0.55 + rnd() * 0.4;
    const micro = (rnd() * 2 - 1) * amp * 0.16 * taper * microScale;
    const w = side * gain * amp * taper + micro;
    pts.push({
      x: start.x + ex * t + pxn * w,
      y: start.y + ey * t + pyn * w,
    });
  }
  pts.push({ x: end.x, y: end.y });

  if (pointJitter > 0 && pts.length > 2) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i] = {
        x: pts[i].x + (rnd() * 2 - 1) * pointJitter,
        y: pts[i].y + (rnd() * 2 - 1) * pointJitter,
      };
    }
  }
  return { pts, nested, amp, el, outX: ux, outY: uy, spine: vertical ? p.x : p.y };
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
  /* Spores hyphal tip. Roots are large glowing hubs; leaves stay small tips. */
  if (kind === "hyphal-tip") {
    const rnd = mulberry32(hashSeed(String(n.id || "")));
    const hub = (n.depth || 0) === 0;
    const core = n.r || (hub ? 14 : 4.6);
    const ang = Number.isFinite(n.tipAng) ? n.tipAng : rnd() * Math.PI * 2;
    if (hub) {
      const mid = core * 1.62;
      const halo = core * 2.45 + rnd() * 1.4;
      const tipLen = core * 0.85 + rnd() * 3;
      const tx = n.x + Math.cos(ang) * (core + tipLen);
      const ty = n.y + Math.sin(ang) * (core + tipLen);
      const midX = n.x + Math.cos(ang) * (core + tipLen * 0.45);
      const midY = n.y + Math.sin(ang) * (core + tipLen * 0.45);
      const hubGlow = skinOpts().glow ? ' filter="url(#hubglow)"' : "";
      return `<circle class="orb orb-halo" cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(halo)}"${hubGlow}/>` +
        `<circle class="orb orb-mid" cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(mid)}"${hubGlow}/>` +
        `<circle class="orb" cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(core)}"${hubGlow}/>` +
        `<path class="orb orb-tip hub-tip" d="M ${fmt(n.x + Math.cos(ang) * core * 0.55)} ${fmt(n.y + Math.sin(ang) * core * 0.55)} Q ${fmt(midX)} ${fmt(midY)} ${fmt(tx)} ${fmt(ty)}"${hubGlow}/>`;
    }
    const tipLen = 7 + rnd() * 3.2;
    const tx = n.x + Math.cos(ang) * tipLen;
    const ty = n.y + Math.sin(ang) * tipLen;
    const midX = n.x + Math.cos(ang) * tipLen * 0.55 + Math.cos(ang + 1.2) * 1.2;
    const midY = n.y + Math.sin(ang) * tipLen * 0.55 + Math.sin(ang + 1.2) * 1.2;
    return `<circle class="orb" cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(core)}"${glow}/>` +
      `<path class="orb orb-tip" d="M ${fmt(n.x)} ${fmt(n.y)} Q ${fmt(midX)} ${fmt(midY)} ${fmt(tx)} ${fmt(ty)}"${glow}/>`;
  }
  return `<circle class="orb" cx="${n.x}" cy="${n.y}" r="${r}"${glow}/>`;
}

/** Title sits in the quiet wedge (hubs) or outward along the hypha (children). */
function labelAnchor(n) {
  const title = n.title || "";
  if ((n.depth || 0) === 0) {
    const halfW = Math.max(24, title.length * 3.8);
    const kids = n.childCount || 0;
    const halfGap = kids > 1 ? Math.PI / kids : Math.PI / 2;
    const sinG = Math.sin(Math.min(halfGap, 1.15));
    const halo = (n.r || 14) * 2.55;
    const rLabel = Math.max(halo + 22, (halfW + 16) / Math.max(0.45, sinG));
    return { x: n.x, y: n.y - rLabel, anchor: "middle", dateDy: -16 };
  }
  const ang = Number.isFinite(n.ang) ? n.ang : 0;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const gap = (n.r || 5) + 14;
  if (c > 0.42) return { x: n.x + gap, y: n.y + 3, anchor: "start", dateDy: 12 };
  if (c < -0.42) return { x: n.x - gap, y: n.y + 3, anchor: "end", dateDy: 12 };
  if (s < 0) return { x: n.x, y: n.y - gap - 2, anchor: "middle", dateDy: -12 };
  return { x: n.x, y: n.y + gap + 11, anchor: "middle", dateDy: 12 };
}

function labelBounds(n) {
  const place = labelAnchor(n);
  const hub = (n.depth || 0) === 0;
  const titleW = Math.max(28, (n.title || "").length * (hub ? 7.6 : 6.6));
  const dateW = Math.max(28, String(n.started || "—").length * 5.5);
  const w = Math.max(titleW, dateW);
  let left;
  let right;
  if (place.anchor === "start") {
    left = place.x;
    right = place.x + w;
  } else if (place.anchor === "end") {
    left = place.x - w;
    right = place.x;
  } else {
    left = place.x - w / 2;
    right = place.x + w / 2;
  }
  const ys = [place.y, place.y + place.dateDy];
  return {
    left,
    right,
    top: Math.min(...ys) - (hub ? 14 : 12),
    bot: Math.max(...ys) + 6,
  };
}

function nodeLabel(n) {
  const place = labelAnchor(n);
  const label = escapeHtml(n.title || "");
  const date = escapeHtml(n.started || "—");
  const hub = (n.depth || 0) === 0 ? " hub-label" : "";
  return `<text class="node-title${hub}" x="${fmt(place.x)}" y="${fmt(place.y)}" text-anchor="${place.anchor}">${label}</text>` +
    `<text class="date-label" x="${fmt(place.x)}" y="${fmt(place.y + place.dateDy)}" text-anchor="${place.anchor}">${date}</text>`;
}


function renderGraph(projects) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  orientMode = preferredOrient();
  const { w, h, vertical, nodes, rootNodes, byId } = layout(projects, orientMode);
  const opts = skinOpts();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.style.aspectRatio = `${w} / ${h}`;
  svg.setAttribute("data-edge-mode", opts.edges);
  svg.setAttribute("data-orient", vertical ? "vertical" : "horizontal");
  svg.setAttribute("data-fork-style", currentForkStyle());

  const dash = opts.dashed ? ' stroke-dasharray="6 4"' : "";
  const glowFilter = opts.glow
    ? `<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<filter id="hubglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";

  const defs = `<defs>${glowFilter}</defs>`;

  // Faint chronological link between root hubs when more than one exists.
  // A single hub stays radial, with dates on the nodes instead of a spine of dots.
  const orderedRoots = [...(rootNodes || [])].sort((a, b) => {
    const ta = a.t == null ? Infinity : a.t;
    const tb = b.t == null ? Infinity : b.t;
    return ta - tb || String(a.id).localeCompare(String(b.id));
  });
  let timeGuide = "";
  if (orderedRoots.length >= 2) {
    const pts = orderedRoots.map((n) => `${fmt(n.x)},${fmt(n.y)}`).join(" ");
    timeGuide = `<polyline class="time-guide" points="${pts}" />`;
    const first = orderedRoots[0];
    const last = orderedRoots[orderedRoots.length - 1];
    const earlier = vertical
      ? `<text class="axis-caption" x="${fmt(first.x)}" y="${fmt(Math.max(14, first.y - first.r - 36))}" text-anchor="middle">EARLIER</text>`
      : `<text class="axis-caption" x="${fmt(Math.max(8, first.x - 8))}" y="${fmt(Math.max(14, first.y - first.r - 28))}" text-anchor="end">EARLIER</text>`;
    const later = vertical
      ? `<text class="axis-caption" x="${fmt(last.x)}" y="${fmt(last.y + last.r + 28)}" text-anchor="middle">LATER</text>`
      : `<text class="axis-caption" x="${fmt(last.x + 8)}" y="${fmt(Math.max(14, last.y - last.r - 28))}" text-anchor="start">LATER</text>`;
    timeGuide += earlier + later;
  }

  const branches = nodes.filter((n) => n.parent && byId[n.parent]).map((n) => {
    const parent = byId[n.parent];
    const fromHub = (parent.depth || 0) === 0;
    const reach = fromHub ? "from-hub" : "nested";
    const filt = opts.glow ? ' filter="url(#glow)"' : "";
    if (opts.edges === "mold") {
      const bundle = moldForkBundle(parent, n, vertical);
      const d = bundle.main;
      // Ribbon: soft sheath near the hub, thin core the rest of the way. No whiskers.
      let layers = "";
      if (bundle.sheath === "soft") {
        layers += `<path class="edge mold-sheath ${reach}" d="${d}" pathLength="100" stroke-dasharray="42 62"/>`;
        if (bundle.midLayer) {
          layers += `<path class="edge mold-mid ${reach}" d="${d}" pathLength="100" stroke-dasharray="74 30"/>`;
        }
      } else if (bundle.sheath === "thin") {
        layers += `<path class="edge mold-sheath mold-sheath-thin ${reach}" d="${d}" pathLength="100" stroke-dasharray="30 74"/>`;
      }
      const core = `<path class="edge mold-core ${reach}" d="${d}"${dash}${filt}/>`;
      const loops = bundle.anastomoses.map((ad) =>
        `<path class="edge mold-anas" d="${ad}"/>`
      ).join("");
      const whisk = bundle.whiskers.map((wd) =>
        `<path class="edge mold-whisker" d="${wd}"/>`
      ).join("");
      return loops + layers + core + whisk;
    }
    const d = edgePath(parent, n, opts.edges, vertical);
    return `<path class="edge ${reach}" d="${d}"${dash}${filt}/>`;
  }).join("");

  const dots = nodes.map((n) => {
    const hub = (n.depth || 0) === 0;
    return `<g class="node${hub ? " hub" : ""}" tabindex="0" role="button" data-id="${escapeHtml(n.id)}" data-depth="${n.depth || 0}">
      <title>${escapeHtml(n.title || "")} · ${escapeHtml(n.started || "undated")}</title>
      ${nodeShape(n, opts.nodes)}
      ${nodeLabel(n)}
    </g>`;
  }).join("");

  svg.innerHTML = defs + timeGuide + branches + dots;
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
