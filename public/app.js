const DEFAULT_SKIN = "spores";
const SKINS = {
  spores: { edges: "mold", nodes: "hyphal-tip", glow: true, dashed: false },
};

const DEFAULT_LOOK = "current";
const LOOK_STORAGE_KEY = "loom-look";

const DEFAULT_FORK_STYLE = "ribbon";
/** Ribbon hyphae: a primary lineage strand with restrained surface detail. */
const FORK_STYLES = {
  ribbon: {
    ampScale: 0.32,
    midScale: 0.28,
    peelScale: 0.72,
    microScale: 0.12,
    sheath: "soft",
    midLayer: true,
    maxWhiskers: 1,
    whiskerTiny: true,
    anastomoses: true,
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

/** Safely preserve public links embedded in otherwise plain-text summaries. */
function linkifyPublicUrls(s) {
  return escapeHtml(s).replace(/https?:\/\/[^\s<]+/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
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

  // Leave deliberate breathing room above and below the horizontal spine:
  // hub halos, titles, and chronology labels should never compete.
  let maxUp = 104;
  let maxDown = 108;
  let maxRight = 210;
  for (const item of items) {
    const c = Math.abs(crossOf(item.side));
    if (vertical) maxRight = Math.max(maxRight, crossOf(item.side) + 210);
    else if (item.side < 0) maxUp = Math.max(maxUp, c + 46);
    else if (item.side > 0) maxDown = Math.max(maxDown, c + 44);
    else maxUp = Math.max(maxUp, (item.depth || 0) === 0 ? 104 : 64);
  }

  // Horizontal chronology lives in its own band below the entire hyphal field.
  // On narrow screens, the date column stays outside the root hub instead.
  const nodeBase = Math.round(maxUp + 16);
  const spine = vertical ? 74 : Math.round(nodeBase + maxDown + 44);
  const h = vertical ? Math.round(mainEnd + 46) : Math.round(spine + 94);
  const width = vertical ? Math.round(spine + maxRight) : w;

  const nodes = items.map((item, i) => {
    const off = crossOf(item.side);
    const x = vertical ? spine + off : mains[i];
    const y = vertical ? mains[i] : nodeBase + off;
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
 * One cubic centerline per hypha. It starts and ends on the actual node rims,
 * so sibling forks fan out naturally without a stack of center-originating
 * strokes. Extending beneath each node keeps the join visually continuous.
 */
function moldHyphaPoints(p, c, vertical, rnd) {
  const nested = (p.side || 0) !== 0;
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const centerDist = Math.hypot(dx, dy) || 1;
  const ux = dx / centerDist;
  const uy = dy / centerDist;
  const startR = nodeRadius(p) + 1.5;
  const endR = nodeRadius(c) + 1.5;
  const start = { x: p.x + ux * startR, y: p.y + uy * startR };
  const end = { x: c.x - ux * endR, y: c.y - uy * endR };
  const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const nx = -uy;
  const ny = ux;
  const signedSway = () => (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.55);
  // A compact, irregular drift reads as a growing hypha rather than a smooth route.
  const bend = signedSway() * Math.min(nested ? 8 : 18, dist * 0.075);
  const twistA = signedSway() * Math.min(nested ? 6 : 12, dist * 0.06);
  const twistB = signedSway() * Math.min(nested ? 3.5 : 7, dist * 0.032);
  const phaseA = rnd() * Math.PI * 2;
  const phaseB = rnd() * Math.PI * 2;
  const c1 = { x: start.x + ux * dist * 0.32 + nx * bend, y: start.y + uy * dist * 0.32 + ny * bend };
  const c2 = { x: end.x - ux * dist * 0.25 + nx * bend * 0.45, y: end.y - uy * dist * 0.25 + ny * bend * 0.45 };
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const mt = 1 - t;
    const sway = Math.sin(Math.PI * t) * (
      twistA * Math.sin(Math.PI * 2 * t + phaseA) +
      twistB * Math.sin(Math.PI * 4 * t + phaseB)
    );
    pts.push({
      x: mt ** 3 * start.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * end.x + nx * sway,
      y: mt ** 3 * start.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * end.y + ny * sway,
    });
  }
  return { pts, nested, amp: Math.abs(bend), el: dist, outX: ux, outY: uy, spine: p.spine };
}

/**
 * Cross-links take a visibly separate lane, so they do not appear to attach
 * to an unrelated root that happens to sit between their two endpoints.
 */
function adHocHyphaPoints(source, target, vertical, rnd, nodes) {
  const bundle = moldHyphaPoints(source, target, vertical, rnd);
  const preferredSide = Math.sign(target.side || source.side || (rnd() < 0.5 ? -1 : 1));
  const offset = Math.min(62, bundle.el * 0.14) + 10;
  const routeFor = (side, scale) => bundle.pts.map((pt, i) => {
    const t = i / Math.max(1, bundle.pts.length - 1);
    const bow = (1 - Math.abs(2 * t - 1)) * offset * side * scale;
    return vertical ? { ...pt, x: pt.x + bow } : { ...pt, y: pt.y + bow };
  });
  const collisionCost = (pts) => pts.reduce((cost, pt) => cost + (nodes || []).reduce((nodeCost, node) => {
    const label = labelBounds(node, vertical);
    const labelDistance = rectDistance(pt, label);
    const labelCost = Math.max(0, 10 - labelDistance) ** 2 * 2;
    if (node.id === source.id || node.id === target.id) return nodeCost + labelCost;
    const clearance = nodeRadius(node) + 42;
    const distance = Math.hypot(pt.x - node.x, pt.y - node.y);
    return nodeCost + Math.max(0, clearance - distance) ** 2 + labelCost;
  }, 0), 0);
  const routes = [
    { pts: routeFor(preferredSide, 1), bend: 0 },
    { pts: routeFor(-preferredSide, 1), bend: 0 },
    { pts: routeFor(preferredSide, 1.5), bend: 6 },
    { pts: routeFor(-preferredSide, 1.5), bend: 6 },
    { pts: routeFor(preferredSide, 2), bend: 14 },
    { pts: routeFor(-preferredSide, 2), bend: 14 },
  ];
  const chosen = routes.reduce((best, route) =>
    collisionCost(route.pts) + route.bend < collisionCost(best.pts) + best.bend ? route : best
  ).pts;
  const knots = [0, 5, 11, 17, chosen.length - 1];
  bundle.pts = knots.map((index, i) => {
    const pt = chosen[index];
    if (i === 0 || i === knots.length - 1) return pt;
    const before = chosen[knots[i - 1]];
    const after = chosen[knots[i + 1]];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    const wobble = (rnd() * 2 - 1) * 3.5;
    return { x: pt.x - dy * inv * wobble, y: pt.y + dx * inv * wobble };
  });
  return bundle;
}

/** A calm chronological thread between root nodes, hidden beneath their rims. */
function mainThreadPoints(parent, child, rnd) {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const nx = -uy;
  const ny = ux;
  const signedDrift = () => (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.55);
  // Keep chronology legible, but let the root thread wander like a living vein.
  const drift = Math.min(12, distance * 0.032);
  const bendA = signedDrift() * drift;
  const bendB = signedDrift() * drift * 0.82;
  const bendC = signedDrift() * drift * 0.48;
  return [
    { x: parent.x + ux * (nodeRadius(parent) + 1.5), y: parent.y + uy * (nodeRadius(parent) + 1.5) },
    { x: parent.x + ux * distance * 0.22 + nx * bendA, y: parent.y + uy * distance * 0.22 + ny * bendA },
    { x: parent.x + ux * distance * 0.48 + nx * bendB, y: parent.y + uy * distance * 0.48 + ny * bendB },
    { x: parent.x + ux * distance * 0.74 + nx * bendC, y: parent.y + uy * distance * 0.74 + ny * bendC },
    { x: child.x - ux * (nodeRadius(child) + 1.5), y: child.y - uy * (nodeRadius(child) + 1.5) },
  ];
}

/** Low-contrast dust and companion strands keep the root thread in a living field. */
function mainThreadAtmosphere(pts, rnd) {
  const spores = [];
  for (let i = 0; i < 18; i++) {
    const s = moldSample(pts, 0.06 + rnd() * 0.88);
    const nx = -s.ty;
    const ny = s.tx;
    const side = rnd() < 0.5 ? -1 : 1;
    const spread = 5 + rnd() * 23;
    spores.push(`<circle class="main-spore" cx="${fmt(s.x + nx * side * spread)}" cy="${fmt(s.y + ny * side * spread)}" r="${fmt(0.3 + rnd() * 0.65)}"/>`);
  }
  const filaments = [-1, 1].map((side) => {
    const a = moldSample(pts, 0.1 + rnd() * 0.08);
    const b = moldSample(pts, 0.82 + rnd() * 0.1);
    const middle = moldLerpPt(a, b, 0.5);
    const nx = -(a.ty + b.ty) * 0.5;
    const ny = (a.tx + b.tx) * 0.5;
    const inv = 1 / (Math.hypot(nx, ny) || 1);
    const distance = 7 + rnd() * 11;
    const filament = moldSmooth([
      { x: a.x + nx * inv * side * distance * 0.45, y: a.y + ny * inv * side * distance * 0.45 },
      { x: middle.x + nx * inv * side * distance, y: middle.y + ny * inv * side * distance },
      { x: b.x + nx * inv * side * distance * 0.55, y: b.y + ny * inv * side * distance * 0.55 },
    ]);
    return `<path class="edge main-filament" d="${filament}"/>`;
  });
  return `${filaments.join("")}${spores.join("")}`;
}

function crookedPolyline(pts) {
  return pts.map((pt, i) => `${i ? "L" : "M"} ${fmt(pt.x)} ${fmt(pt.y)}`).join(" ");
}

/** Approximate the rendered label so cross-links route through clear space. */
function labelBounds(node, vertical) {
  const root = (node.depth || 0) === 0;
  const width = Math.max(28, (node.title || "").length * (root ? 8.8 : 6.8) + 8);
  if (vertical) {
    const x = node.x + (root ? nodeRadius(node) * 1.7 + 12 : nodeRadius(node) + 10);
    return { x: x - 3, y: node.y - 16, width, height: 18 };
  }
  const outward = node.side === 0 ? -1 : Math.sign(node.side);
  const lift = node.side === 0 ? (root ? 40 : 22) : nodeRadius(node) + 12;
  const baseline = outward < 0 ? node.y - lift : node.y + nodeRadius(node) + 15;
  return { x: node.x - width / 2, y: baseline - 14, width, height: 18 };
}

function rectDistance(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
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
  const n = rnd() < 0.38 ? 1 : 0;
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
    const bulge = (0.55 + rnd() * 0.85) * Math.min(Math.max(8, amp * 1.3), 16);
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

/** Rare companion filaments add atmosphere without competing with lineage. */
function moldFieldFilaments(pts, rnd, nested) {
  const out = [];
  const count = !nested && rnd() < 0.35 ? 1 : 0;
  for (let i = 0; i < count; i++) {
    const t0 = 0.06 + rnd() * 0.22;
    const t1 = Math.min(0.94, t0 + 0.28 + rnd() * 0.24);
    const a = moldSample(pts, t0);
    const b = moldSample(pts, t1);
    const nx = -(a.ty + b.ty) * 0.5;
    const ny = (a.tx + b.tx) * 0.5;
    const nlen = Math.hypot(nx, ny) || 1;
    const side = rnd() < 0.5 ? -1 : 1;
    const offset = 8 + rnd() * (nested ? 8 : 15);
    out.push(moldSmooth([
      { x: a.x, y: a.y },
      { x: a.x + (nx / nlen) * side * offset * 0.7 + a.tx * 12, y: a.y + (ny / nlen) * side * offset * 0.7 + a.ty * 12 },
      { x: b.x + (nx / nlen) * side * offset - b.tx * 10, y: b.y + (ny / nlen) * side * offset - b.ty * 10 },
      { x: b.x, y: b.y },
    ]));
  }
  return out;
}

/**
 * Faint particles live near real hyphae, not as standalone graph nodes.
 * They are seeded from the branch id and deliberately cannot receive input.
 */
function moldSpores(pts, rnd, nested) {
  const out = [];
  const count = (nested ? 8 : 15) + Math.floor(rnd() * (nested ? 6 : 10));
  for (let i = 0; i < count; i++) {
    const s = moldSample(pts, 0.08 + rnd() * 0.84);
    const nx = -s.ty;
    const ny = s.tx;
    const sign = rnd() < 0.5 ? -1 : 1;
    const spread = 5 + rnd() * (nested ? 15 : 28);
    const drift = (rnd() * 2 - 1) * 7;
    const r = 0.45 + rnd() * 0.85;
    out.push(`<circle class="field-spore" cx="${fmt(s.x + nx * sign * spread + s.tx * drift)}" cy="${fmt(s.y + ny * sign * spread + s.ty * drift)}" r="${fmt(r)}"/>`);
  }
  return out;
}

/**
 * Organic fork from parent → child. Ribbon geometry, seeded from the child id.
 */
function moldForkBundle(p, c, vertical) {
  const style = forkOpts();
  const rnd = mulberry32(hashSeed(String(c.id || "")));
  const { pts, nested, amp, el } = moldHyphaPoints(p, c, vertical, rnd, style);
  const main = moldSmooth(pts);
  const whiskers = moldWhiskers(pts, rnd, nested, amp, style);
  const anastomoses = moldAnastomoses(pts, rnd, nested, amp, style);
  const filaments = moldFieldFilaments(pts, rnd, nested);
  const spores = moldSpores(pts, rnd, nested);
  return {
    main,
    pts,
    el,
    whiskers,
    anastomoses,
    filaments,
    spores,
    nested,
    sheath: style.sheath || "none",
    midLayer: !!style.midLayer,
  };
}

/** Filled hypha; callers choose a constant or tapered width along its path. */
function ribbonOutline(pts, t0, t1, widthAt) {
  const steps = 32;
  const left = [];
  const right = [];
  const span = Math.max(0.08, t1 - t0);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const t = t0 + span * u;
    const s = moldSample(pts, t);
    const hw = Math.max(0.35, widthAt(u) / 2);
    const nx = -s.ty;
    const ny = s.tx;
    left.push({ x: s.x + nx * hw, y: s.y + ny * hw });
    right.push({ x: s.x - nx * hw, y: s.y - ny * hw });
  }
  const cmds = [`M ${fmt(left[0].x)} ${fmt(left[0].y)}`];
  for (let i = 1; i < left.length; i++) cmds.push(`L ${fmt(left[i].x)} ${fmt(left[i].y)}`);
  for (let i = right.length - 1; i >= 0; i--) cmds.push(`L ${fmt(right[i].x)} ${fmt(right[i].y)}`);
  cmds.push("Z");
  return cmds.join(" ");
}

/** Main-node links hold this width; parent-to-child forks deliberately taper. */
const MAIN_HYPHA_WIDTH = 5.5;
/** Center-to-periphery: a parent-to-child hypha thins as it grows outward. */
function forkTaperWidths(parentDepth) {
  const depth = Math.max(0, parentDepth || 0);
  const start = Math.max(2.2, 8.6 * Math.pow(0.58, depth));
  const end = Math.max(0.7, 1.35 * Math.pow(0.7, depth));
  return { start, end };
}

function moldFork(p, c, vertical) {
  return moldForkBundle(p, c, vertical).main;
}

/** Closed smooth outline. Same tension as the hypha curves. */
function closedBlob(pts) {
  const n = pts.length;
  if (n < 3) return "";
  const d = [`M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
  }
  d.push("Z");
  return d.join(" ");
}

/**
 * Near-circular organic outline. Seeded from the node id so it stays put.
 * Low harmonics plus one soft lobe — irregular, not a perfect circle.
 */
function organicBlob(cx, cy, radius, seed) {
  const rnd = mulberry32(hashSeed(String(seed || "blob")));
  const count = 12;
  const amp1 = 0.055 + rnd() * 0.035;
  const amp2 = 0.022 + rnd() * 0.02;
  const f1 = 2 + Math.floor(rnd() * 2);
  const f2 = 3 + Math.floor(rnd() * 2);
  const ph1 = rnd() * Math.PI * 2;
  const ph2 = rnd() * Math.PI * 2;
  const bulgeAt = rnd() * Math.PI * 2;
  const bulge = 0.08 + rnd() * 0.06;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    let k = 1 + amp1 * Math.sin(f1 * t + ph1) + amp2 * Math.sin(f2 * t + ph2);
    const dAng = Math.atan2(Math.sin(t - bulgeAt), Math.cos(t - bulgeAt));
    k += bulge * Math.exp(-(dAng * dAng) / 0.28);
    const rr = Math.max(radius * 0.86, radius * k);
    pts.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr });
  }
  return closedBlob(pts);
}

/** The same deterministic radius is used by both the blob and its hyphae. */
function nodeRadius(n) {
  const rnd = mulberry32(hashSeed(String(n.id || "") + ":size"));
  return (n.depth || 0) === 0 ? 10.8 + rnd() * 1.1 : 5.6 + rnd() * 0.7;
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
  /* Spores nodes: irregular near-circles. Roots stay larger than leaves. */
  if (kind === "hyphal-tip") {
    const hub = (n.depth || 0) === 0;
    const core = nodeRadius(n);
    const fill = hub ? "hubBlobGradient" : "tipBlobGradient";
    const body = `<path class="orb orb-blob${hub ? " hub-orb" : ""}" style="fill: url(#${fill})" d="${organicBlob(n.x, n.y, core, String(n.id || "") + ":shape")}"${hub ? glow : ""}/>`;
    if (!hub) {
      return body;
    }
    return body;
  }
  return `<circle class="orb" cx="${n.x}" cy="${n.y}" r="${r}"${glow}/>`;
}

function nodeLabel(n, opts) {
  const label = escapeHtml(n.title || "");
  const vertical = n.vertical;
  const labelClass = (n.depth || 0) === 0 ? "node-label node-label-root" : "node-label node-label-child";
  if (vertical) {
    const tx = n.x + ((n.depth || 0) === 0 ? nodeRadius(n) * 1.7 + 12 : nodeRadius(n) + 10);
    if (opts.stamp) {
      const tw = Math.min(188, Math.max(36, (n.title || "").length * 6.15 + 10));
      const th = 14;
      const ty = n.y - th / 2 - 7;
      return `<g class="stamp-label">
        <rect class="stamp" x="${tx}" y="${ty}" width="${tw}" height="${th}"/>
        <text class="${labelClass}" x="${tx + 5}" y="${ty + 10.5}" text-anchor="start">${label}</text>
      </g>`;
    }
    return `<text class="${labelClass}" x="${tx}" y="${n.y - 2}" text-anchor="start">${label}</text>`;
  }
  const outward = n.side === 0 ? -1 : Math.sign(n.side);
  if (opts.stamp) {
    const tw = Math.max(36, (n.title || "").length * 6.15 + 10);
    const th = 14;
    const tx = n.x - tw / 2;
    const tyBox = outward < 0 ? n.y - (n.side === 0 ? 36 : 28) : n.y + 14;
    return `<g class="stamp-label">
      <rect class="stamp" x="${tx}" y="${tyBox}" width="${tw}" height="${th}"/>
      <text class="${labelClass}" x="${n.x}" y="${tyBox + 10.5}" text-anchor="middle">${label}</text>
      </g>`;
  }
  const lift = n.side === 0 ? ((n.depth || 0) === 0 ? 40 : 22) : nodeRadius(n) + 12;
  const ty = outward < 0 ? n.y - lift : n.y + nodeRadius(n) + 15;
  return `<text class="${labelClass}" x="${n.x}" y="${ty}" text-anchor="middle">${label}</text>`;
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
  const branchGradients = [];
  let defs = "";

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
    return `<text class="tick-label" x="${n.main}" y="${spine + 72}" text-anchor="middle">${date}</text>`;
  }).join("");

  // Roots are the primary chronological thread. Connect them directly with
  // one crooked, steady-width strand; the nodes paint over its end overlap.
  const roots = nodes.filter((n) => (n.depth || 0) === 0);
  const mainAtmosphere = [];
  const mainConnections = roots.slice(1).map((n, i) => {
    if (opts.edges !== "mold") return "";
    const parent = roots[i];
    const rnd = mulberry32(hashSeed(`${parent.id}->${n.id}:main`));
    const pts = mainThreadPoints(parent, n, rnd);
    mainAtmosphere.push(mainThreadAtmosphere(pts, rnd));
    const ribbon = ribbonOutline(pts, 0, 1, () => MAIN_HYPHA_WIDTH);
    return `<path class="edge mold-ribbon mold-ribbon-main" style="fill: var(--branch)" filter="url(#hyphaTexture)" d="${ribbon}"/>`;
  }).join("");

  // Optional data links are not parentage: they can join any two nodes once.
  const drawnAdHocLinks = new Set();
  const adHocConnections = nodes.flatMap((source) => {
    const targets = Array.isArray(source.connections) ? source.connections : [];
    return targets.flatMap((targetId) => {
      const target = byId[targetId];
      const key = [source.id, targetId].sort().join("::");
      if (!target || source.id === targetId || drawnAdHocLinks.has(key)) return [];
      drawnAdHocLinks.add(key);
      const rnd = mulberry32(hashSeed(`${source.id}->${targetId}:adhoc`));
      const { pts } = adHocHyphaPoints(source, target, vertical, rnd, nodes);
      return `<path class="edge adhoc-connection" d="${crookedPolyline(pts)}"/>`;
    });
  }).join("");

  const branches = nodes.filter((n) => n.parent && byId[n.parent]).map((n) => {
    const parent = byId[n.parent];
    const filt = opts.glow ? ' filter="url(#glow)"' : "";
    if (opts.edges === "mold") {
      const bundle = moldForkBundle(parent, n, vertical);
      const { start, end } = forkTaperWidths(parent.depth || 0);
      const ribbon = ribbonOutline(bundle.pts, 0, 1, (u) => {
        const t = Math.max(0, Math.min(1, u));
        const ease = t * t * (3 - 2 * t);
        return start + (end - start) * ease;
      });
      const firstPt = bundle.pts[0];
      const lastPt = bundle.pts[bundle.pts.length - 1];
      const gradientId = `hyphaGradient-${escapeHtml(n.id)}`;
      branchGradients.push(`<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${fmt(firstPt.x)}" y1="${fmt(firstPt.y)}" x2="${fmt(lastPt.x)}" y2="${fmt(lastPt.y)}">
        <stop offset="0%" stop-color="#f7fee7" stop-opacity="0.98"/>
        <stop offset="20%" stop-color="var(--node)" stop-opacity="0.98"/>
        <stop offset="68%" stop-color="var(--branch)" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.82"/>
      </linearGradient>`);
      const loops = bundle.anastomoses.map((ad) =>
        `<path class="edge mold-anas" d="${ad}"/>`
      ).join("");
      const filaments = bundle.filaments.map((fd) =>
        `<path class="edge mold-field" d="${fd}"/>`
      ).join("");
      const whisk = bundle.whiskers.map((wd) =>
        `<path class="edge mold-whisker" d="${wd}"/>`
      ).join("");
      const spores = bundle.spores.join("");
      return loops + filaments + whisk + spores + `<path class="edge mold-ribbon mold-ribbon-inner" style="fill: url(#${gradientId})" filter="url(#hyphaTexture)" d="${ribbon}"/>`;
    }
    const d = edgePath(parent, n, opts.edges, vertical);
    return `<path class="edge" d="${d}"${dash}${filt}/>`;
  }).join("");

  defs = `<defs>
    <linearGradient id="spineGrad" x1="${vertical ? 0 : 0}" y1="${vertical ? 0 : 0}" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">
      <stop offset="0%" stop-color="var(--spine)" stop-opacity="0.35"/>
      <stop offset="18%" stop-color="var(--spine)"/>
      <stop offset="100%" stop-color="var(--spine)"/>
    </linearGradient>
    <radialGradient id="hubBlobGradient" cx="31%" cy="26%" r="76%">
      <stop offset="0%" stop-color="#f7fee7" stop-opacity="0.98"/>
      <stop offset="42%" stop-color="var(--node)" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.94"/>
    </radialGradient>
    <radialGradient id="tipBlobGradient" cx="30%" cy="24%" r="78%">
      <stop offset="0%" stop-color="#ecfccb" stop-opacity="0.98"/>
      <stop offset="55%" stop-color="var(--node)" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.9"/>
    </radialGradient>
    <filter id="hyphaTexture" x="-8%" y="-12%" width="116%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.12 0.42" numOctaves="2" seed="7" result="noise"/>
      <feComposite in="noise" in2="SourceGraphic" operator="in" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="soft-light"/>
    </filter>
    ${branchGradients.join("")}
    ${glowFilter}
  </defs>`;

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
    const hub = (n.depth || 0) === 0;
    return `<g class="node${hub ? " hub" : ""}" tabindex="0" role="button" data-id="${escapeHtml(n.id)}" data-depth="${n.depth || 0}">
      <title>${escapeHtml(n.title || "")} · ${escapeHtml(n.started || "undated")}</title>
      ${anchor}
      ${nodeShape(n, opts.nodes)}
      ${nodeLabel(n, opts)}
    </g>`;
  }).join("");

  svg.innerHTML = defs + spineLine + arrow + ticks + dates + caption + mainAtmosphere.join("") + mainConnections + branches + adHocConnections + dots;
  svg.querySelectorAll(".node").forEach((el) => {
    const id = el.getAttribute("data-id");
    const focus = () => {
      if (activeId === id) {
        activeId = null;
        renderGraph(projectsCache);
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
  renderGraph(projectsCache);
  syncCards(true);
}

function toggleAllCards() {
  showAllCards = !showAllCards;
  if (!showAllCards) {
    activeId = null;
    renderGraph(projectsCache);
  }
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
    const connections = (Array.isArray(p.connections) ? p.connections : [])
      .map((id) => byId[id] && byId[id].title)
      .filter(Boolean);
    const links = connections.length
      ? `<div class="connection">linked to ${connections.map((title) => escapeHtml(title)).join(", ")}</div>`
      : "";
    const selected = activeId != null && p.id === activeId;
    const visible = showAllCards || selected;
    return `<article class="card${selected ? " active" : ""}" id="card-${escapeHtml(p.id || "")}" data-id="${escapeHtml(p.id || "")}"${visible ? "" : " hidden"}>
      <div class="meta">${escapeHtml(when)}</div>
      ${fork}
      ${links}
      <h2>${escapeHtml(p.title || "Untitled")}</h2>
      <p>${linkifyPublicUrls(p.summary || "")}</p>
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
