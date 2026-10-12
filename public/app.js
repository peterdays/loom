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

const TIME_LAYOUTS = ["spine", "spine-plus", "rings", "strata"];
const DEFAULT_TIME_LAYOUT = "spine";
const TIME_LEDE = {
  spine: "Follow time along the spine; each branch marks where an idea grew into something else.",
  "spine-plus": "The spine still runs early to late; play regrows it, recent nodes burn brighter, and each project draws its span through today.",
  rings: "Time grows outward in dated rings, and each project branches onto the ring of its start.",
  strata: "Scroll downward through dated layers as the mycelium grows from earlier soil into later ground.",
};
const SCENE_LABEL = {
  spine: "Temporal project graph",
  "spine-plus": "Chronological spine with growth, age, and duration",
  rings: "Radial growth rings of projects through time",
  strata: "Vertical soil strata of projects through time",
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let projectsCache = [];
let activeId = null;
let showAllCards = false;
let orientMode = "horizontal";
let timeLayout = DEFAULT_TIME_LAYOUT;
let layoutNarrow = false;
let growth = 1;
let growthPlaying = false;
let growthRaf = 0;
let activeExtent = null;

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
  if (node.labelBox) return node.labelBox;
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
  const span = Math.max(0.001, t1 - t0);
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

function currentTimeLayout() {
  return TIME_LAYOUTS.includes(timeLayout) ? timeLayout : DEFAULT_TIME_LAYOUT;
}

function isNarrow() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function todayUTC() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function formatISO(t) {
  const d = new Date(t);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

function formatMonth(t) {
  const d = new Date(t);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function growthExtent(projects) {
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const project of projects) {
    const started = parseTime(project.started);
    const ended = parseTime(project.ended);
    if (started != null) {
      tMin = Math.min(tMin, started);
      tMax = Math.max(tMax, started);
    }
    if (ended != null) tMax = Math.max(tMax, ended);
  }
  const tNow = todayUTC();
  if (!Number.isFinite(tMin)) return { tMin: tNow, tMax: tNow, tNow };
  if (tMax < tNow) tMax = tNow;
  return { tMin, tMax, tNow };
}

function growthCursor(extent) {
  const span = extent.tMax - extent.tMin || 1;
  return extent.tMin + Math.max(0, Math.min(1, growth)) * span;
}

function ageScaleOf(nodes) {
  const times = nodes.map((node) => node.t).filter(Number.isFinite);
  if (!times.length) return { tMin: 0, tMax: 1 };
  return { tMin: Math.min(...times), tMax: Math.max(...times) };
}

function ageUnit(t, scale) {
  if (!Number.isFinite(t) || !scale || scale.tMax <= scale.tMin) return 1;
  return Math.max(0, Math.min(1, (t - scale.tMin) / (scale.tMax - scale.tMin)));
}

function ageOpacity(t, scale) {
  return 0.46 + 0.54 * ageUnit(t, scale);
}

function ageClass(t, scale) {
  const unit = ageUnit(t, scale);
  if (unit > 0.72) return " age-new";
  if (unit < 0.34) return " age-old";
  return " age-mid";
}

function revealedAt(t, cursor) {
  if (!Number.isFinite(t)) return true;
  return cursor >= t - 1;
}

function linkGrow(tParent, tChild, cursor) {
  if (!Number.isFinite(tChild)) return revealedAt(tParent, cursor) ? 1 : 0;
  if (!Number.isFinite(tParent) || tChild <= tParent) return cursor >= tChild ? 1 : 0;
  if (cursor < tParent) return 0;
  if (cursor >= tChild) return 1;
  return (cursor - tParent) / (tChild - tParent);
}

function endStamp(node, extent) {
  return parseTime(node.ended) || extent.tNow;
}

function indexProjects(projects) {
  const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
  const children = {};
  for (const project of projects) {
    const parent = project.parent && byId[project.parent] ? project.parent : null;
    if (!children[parent]) children[parent] = [];
    children[parent].push(project);
  }
  for (const key of Object.keys(children)) {
    children[key].sort((a, b) => String(a.started || "9999").localeCompare(String(b.started || "9999"))
      || String(a.id).localeCompare(String(b.id)));
  }
  const depthOf = (id, guard = 0) => {
    if (guard > 16) return 0;
    const project = byId[id];
    if (!project || !project.parent || !byId[project.parent]) return 0;
    return 1 + depthOf(project.parent, guard + 1);
  };
  return { byId, children, depthOf };
}

function monthBands(tMin, tMax) {
  const start = new Date(tMin);
  const end = new Date(tMax);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth();
  const bands = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const bandStart = Date.UTC(year, month, 1);
    const next = Date.UTC(year, month + 1, 1);
    bands.push({ start: bandStart, end: next - 1, label: formatMonth(bandStart) });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return bands.length ? bands : [{ start: tMin, end: tMax, label: formatMonth(tMin) }];
}

function quarterBands(tMin, tMax) {
  const start = new Date(tMin);
  const end = new Date(tMax);
  let year = start.getUTCFullYear();
  let quarter = Math.floor(start.getUTCMonth() / 3);
  const endMark = end.getUTCFullYear() * 4 + Math.floor(end.getUTCMonth() / 3);
  const bands = [];
  while (year * 4 + quarter <= endMark) {
    const bandStart = Date.UTC(year, quarter * 3, 1);
    const next = Date.UTC(year, quarter * 3 + 3, 1);
    bands.push({ start: bandStart, end: next - 1, label: `Q${quarter + 1} ${year}` });
    quarter += 1;
    if (quarter > 3) {
      quarter = 0;
      year += 1;
    }
  }
  return bands.length ? bands : monthBands(tMin, tMax);
}

function timeBands(tMin, tMax) {
  const days = (tMax - tMin) / 86400000;
  return days > 1100 ? quarterBands(tMin, tMax) : monthBands(tMin, tMax);
}

function boxesOverlap(a, b, pad) {
  const p = pad || 0;
  return a.x - p < b.x + b.width
    && a.x + a.width + p > b.x
    && a.y - p < b.y + b.height
    && a.y + a.height + p > b.y;
}

function circleHitsBox(cx, cy, radius, box, pad) {
  const p = pad || 0;
  const x = Math.max(box.x - p, Math.min(cx, box.x + box.width + p));
  const y = Math.max(box.y - p, Math.min(cy, box.y + box.height + p));
  return (cx - x) ** 2 + (cy - y) ** 2 < (radius + p) ** 2;
}

function wrapLabel(title, maxChars) {
  const text = String(title || "");
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function labelMetrics(node, maxChars) {
  const root = (node.depth || 0) === 0;
  const lines = wrapLabel(node.title || "", maxChars == null ? (root ? 22 : 18) : maxChars);
  const size = root ? 9.1 : 7.15;
  const lineH = root ? 18 : 14;
  const width = Math.max(24, ...lines.map((line) => line.length * size)) + 4;
  return { lines, width, height: Math.max(lineH, lines.length * lineH), lineH };
}

function textBox(x, y, anchor, width, height) {
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { x: left, y: y - height * 0.82, width, height };
}

function labelMarkup(node, x, y, anchor) {
  const metrics = node.labelMetrics || labelMetrics(node);
  const labelClass = (node.depth || 0) === 0 ? "node-label node-label-root" : "node-label node-label-child";
  const tspans = metrics.lines.map((line, index) => {
    const shown = index < metrics.lines.length - 1 ? `${line} ` : line;
    return `<tspan x="${fmt(x)}" dy="${index === 0 ? 0 : metrics.lineH}">${escapeHtml(shown)}</tspan>`;
  }).join("");
  return `<text class="${labelClass}" x="${fmt(x)}" y="${fmt(y)}" text-anchor="${anchor || "middle"}">${tspans}</text>`;
}

function svgId(value) {
  return String(value || "id").replace(/[^A-Za-z0-9_-]/g, "");
}

function forkMarkup(parent, child, vertical, grow, opacity, key) {
  if (grow <= 0.02) return { gradient: "", svg: "" };
  const bundle = moldForkBundle(parent, child, vertical);
  const widths = forkTaperWidths(parent.depth || 0);
  const drawn = Math.max(0.04, Math.min(1, grow));
  const ribbon = ribbonOutline(bundle.pts, 0, drawn, (u) => {
    const t = Math.max(0, Math.min(1, u));
    const ease = t * t * (3 - 2 * t);
    return widths.start + (widths.end - widths.start) * ease;
  });
  const tip = moldSample(bundle.pts, drawn);
  const firstPt = bundle.pts[0];
  const gradientId = `hyphaGradient-${svgId(key)}`;
  const gradient = `<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${fmt(firstPt.x)}" y1="${fmt(firstPt.y)}" x2="${fmt(tip.x)}" y2="${fmt(tip.y)}">
        <stop offset="0%" stop-color="#f7fee7" stop-opacity="0.98"/>
        <stop offset="20%" stop-color="var(--node)" stop-opacity="0.98"/>
        <stop offset="68%" stop-color="var(--branch)" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.82"/>
      </linearGradient>`;
  let decor = "";
  if (drawn >= 0.98) {
    decor = bundle.anastomoses.map((path) => `<path class="edge mold-anas" d="${path}"/>`).join("")
      + bundle.filaments.map((path) => `<path class="edge mold-field" d="${path}"/>`).join("")
      + bundle.whiskers.map((path) => `<path class="edge mold-whisker" d="${path}"/>`).join("")
      + bundle.spores.join("");
  }
  const svg = `<g class="fork-group" style="opacity:${fmt(opacity)}">${decor}<path class="edge mold-ribbon mold-ribbon-inner" style="fill: url(#${gradientId})" filter="url(#hyphaTexture)" d="${ribbon}"/></g>`;
  return { gradient, svg };
}

function mainThreadMarkup(parent, child, grow, opacity) {
  if (grow <= 0.02) return "";
  const rnd = mulberry32(hashSeed(`${parent.id}->${child.id}:main`));
  const pts = mainThreadPoints(parent, child, rnd);
  const drawn = Math.max(0.04, Math.min(1, grow));
  const ribbon = ribbonOutline(pts, 0, drawn, () => MAIN_HYPHA_WIDTH);
  const atmosphere = drawn >= 0.98 ? mainThreadAtmosphere(pts, rnd) : "";
  return `<g class="fork-group" style="opacity:${fmt(opacity)}">${atmosphere}<path class="edge mold-ribbon mold-ribbon-main" style="fill: var(--branch)" filter="url(#hyphaTexture)" d="${ribbon}"/></g>`;
}

function adHocMarkup(source, target, vertical, nodes, grow, opacity) {
  if (grow <= 0.02) return "";
  const rnd = mulberry32(hashSeed(`${source.id}->${target.id}:adhoc`));
  const { pts } = adHocHyphaPoints(source, target, vertical, rnd, nodes);
  const drawn = Math.max(0.04, Math.min(1, grow));
  const count = Math.max(2, Math.round((pts.length - 1) * drawn) + 1);
  return `<path class="edge adhoc-connection" style="opacity:${fmt(opacity)}" d="${moldSmooth(pts.slice(0, count))}"/>`;
}

function baseDefs(extra, glow) {
  const glowFilter = glow
    ? `<filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";
  return `<defs>
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
    ${extra || ""}
    ${glowFilter}
  </defs>`;
}

function setScene(svg, minX, minY, width, height, orient, mode) {
  svg.setAttribute("viewBox", `${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}`);
  svg.setAttribute("width", String(Math.round(width)));
  svg.setAttribute("height", String(Math.round(height)));
  svg.style.aspectRatio = `${width} / ${height}`;
  svg.setAttribute("data-edge-mode", skinOpts().edges);
  svg.setAttribute("data-orient", orient);
  svg.setAttribute("data-fork-style", currentForkStyle());
  svg.setAttribute("data-time-layout", mode);
  svg.setAttribute("aria-label", SCENE_LABEL[mode] || SCENE_LABEL.spine);
}

function bindGraphNodes(svg) {
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

function durationOpacity(t, scale) {
  const white = document.documentElement.getAttribute("data-look") === "white";
  const age = ageUnit(t, scale);
  return Math.min(0.96, (white ? 0.62 : 0.48) + (white ? 0.34 : 0.4) * age);
}

function durationRibbon(x0, x1, y, seed) {
  if (x1 - x0 < 8) return "";
  const rnd = mulberry32(hashSeed(seed));
  const bow = (rnd() - 0.5) * 2.4;
  const pts = [
    { x: x0, y },
    { x: x0 + (x1 - x0) * 0.34, y: y + bow },
    { x: x0 + (x1 - x0) * 0.68, y: y - bow * 0.65 },
    { x: x1, y },
  ];
  return ribbonOutline(pts, 0, 1, (u) => 10.4 - u * 3.2);
}

function placeChronoLabels(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const rowEnds = [];
  return sorted.map((item) => {
    const width = Math.max(42, item.text.length * 7.7);
    let row = 0;
    while (row < 4 && item.x - width / 2 < (rowEnds[row] ?? -1e9) + 10) row += 1;
    if (row > 3) row = 3;
    const left = item.x - width / 2;
    rowEnds[row] = left + width;
    return { ...item, row, width };
  });
}

function axisAt(nodes, xNow, tNow) {
  const points = nodes
    .filter((node) => Number.isFinite(node.t))
    .map((node) => ({ t: node.t, x: node.x }))
    .sort((a, b) => a.t - b.t || a.x - b.x);
  const unique = [];
  for (const point of points) {
    const prev = unique[unique.length - 1];
    if (prev && Math.abs(prev.t - point.t) < 1) continue;
    unique.push(point);
  }
  if (!unique.length) unique.push({ t: tNow, x: xNow });
  else unique.push({ t: Math.max(tNow, unique[unique.length - 1].t), x: xNow });
  return (t) => {
    if (!Number.isFinite(t)) return xNow;
    if (t <= unique[0].t) return unique[0].x;
    for (let i = 1; i < unique.length; i++) {
      if (t <= unique[i].t) {
        const span = unique[i].t - unique[i - 1].t || 1;
        const u = (t - unique[i - 1].t) / span;
        return unique[i - 1].x + u * (unique[i].x - unique[i - 1].x);
      }
    }
    return unique[unique.length - 1].x;
  };
}

function renderGraph(projects) {
  const mode = currentTimeLayout();
  if (mode === "rings") {
    renderRings(projects);
    return;
  }
  if (mode === "strata") {
    renderStrata(projects);
    return;
  }
  renderSpine(projects, mode === "spine-plus");
}

function renderSpine(projects, plus) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  orientMode = plus ? "horizontal" : preferredOrient();
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
  const extent = growthExtent(projects);
  activeExtent = extent;
  const cursor = plus ? growthCursor(extent) : extent.tMax;
  const ageScale = ageScaleOf(nodes);
  const xNow = (last ? last.main : w - 80) + 118;
  const spineStart = vertical
    ? { x: spine, y: (first ? first.main : 40) - 28 }
    : { x: (first ? first.main : 80) - 78, y: spine };
  const spineEnd = vertical
    ? { x: spine, y: (last ? last.main : h - 30) + 26 }
    : { x: (last ? last.main : w - 40) + 34, y: spine };
  if (plus && !vertical) spineEnd.x = xNow;

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
  let ticks = "";
  let dates = "";
  let durationSvg = "";
  let sceneW = w;
  let sceneH = h;
  if (plus && !vertical) {
    const xAt = axisAt(nodes, xNow, extent.tNow);
    const placed = placeChronoLabels([
      ...chronos.map((n) => ({ x: n.main, text: n.started || "—", t: n.t, kind: "date" })),
      { x: xNow, text: "now", t: extent.tNow, kind: "now" },
    ]);
    const maxRow = placed.reduce((max, item) => Math.max(max, item.row), 0);
    const dateBase = spine + 36;
    const rowH = 18;
    const trackTop = dateBase + (maxRow + 1) * rowH + 18;
    const trackPitch = 18;
    ticks = placed.filter((item) => item.kind === "date").map((item) => {
      const shown = revealedAt(item.t, cursor) ? 1 : 0.35;
      return `<line class="tick" x1="${fmt(item.x)}" y1="${spine - 8}" x2="${fmt(item.x)}" y2="${spine + 8}" style="opacity:${shown}"/>`;
    }).join("");
    dates = placed.map((item) => {
      const y = dateBase + item.row * rowH;
      const shown = revealedAt(item.t, cursor) ? 1 : 0.38;
      const cls = item.kind === "now" ? "now-label" : "tick-label";
      return `<text class="${cls}" x="${fmt(item.x)}" y="${fmt(y)}" text-anchor="middle" style="opacity:${shown}">${escapeHtml(item.text)}</text>`;
    }).join("");
    const spans = nodes.map((n, index) => {
      if (!revealedAt(n.t, cursor)) return "";
      const y = trackTop + index * trackPitch;
      const end = Math.min(endStamp(n, extent), cursor);
      const x1 = xAt(end);
      if (!(x1 > n.x + 6)) return "";
      const ribbon = durationRibbon(n.x, x1, y, `duration:${n.id}`);
      if (!ribbon) return "";
      const on = activeId === n.id ? " duration-on" : "";
      const opacity = durationOpacity(n.t, ageScale);
      return `<path class="duration-span${on}" data-span="${escapeHtml(n.id)}" style="opacity:${fmt(opacity)}" d="${ribbon}"><title>${escapeHtml(n.title || "")} · ${escapeHtml(n.started || "?")} → ${n.ended ? escapeHtml(n.ended) : "now"}</title></path>`;
    }).join("");
    const trackBottom = trackTop + Math.max(1, nodes.length) * trackPitch;
    durationSvg = `<rect class="span-band" x="0" y="${fmt(trackTop - 14)}" width="${fmt(Math.max(w, xNow + 78))}" height="${fmt(nodes.length * trackPitch + 22)}"></rect>`
      + `<text class="span-caption" x="12" y="${fmt(trackTop + 4)}" text-anchor="start">SPAN</text>`
      + `<line class="growth-front" x1="${fmt(xAt(cursor))}" y1="${fmt(trackTop - 10)}" x2="${fmt(xAt(cursor))}" y2="${fmt(trackBottom)}" style="${growth >= 0.999 ? "opacity:0" : ""}"/>`
      + spans;
    sceneW = Math.max(w, xNow + 78);
    sceneH = Math.max(h, trackBottom + 28);
  } else {
    ticks = chronos.map((n) => {
      if (vertical) {
        return `<line class="tick" x1="${spine - 4}" y1="${n.main}" x2="${spine + 4}" y2="${n.main}"/>`;
      }
      return `<line class="tick" x1="${n.main}" y1="${spine - 4}" x2="${n.main}" y2="${spine + 4}"/>`;
    }).join("");
    dates = chronos.map((n) => {
      const date = escapeHtml(n.started || "—");
      if (vertical) {
        return `<text class="tick-label" x="${spine - 8}" y="${n.main + 3}" text-anchor="end">${date}</text>`;
      }
      return `<text class="tick-label" x="${n.main}" y="${spine + 72}" text-anchor="middle">${date}</text>`;
    }).join("");
  }

  // Roots are the primary chronological thread. Connect them directly with
  // one crooked, steady-width strand; the nodes paint over its end overlap.
  const roots = nodes.filter((n) => (n.depth || 0) === 0);
  const mainAtmosphere = [];
  let mainConnections = "";
  let adHocConnections = "";
  let branches = "";
  if (!plus) {
    mainConnections = roots.slice(1).map((n, i) => {
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
    adHocConnections = nodes.flatMap((source) => {
      const targets = Array.isArray(source.connections) ? source.connections : [];
      return targets.flatMap((targetId) => {
        const target = byId[targetId];
        const key = [source.id, targetId].sort().join("::");
        if (!target || source.id === targetId || drawnAdHocLinks.has(key)) return [];
        drawnAdHocLinks.add(key);
        const rnd = mulberry32(hashSeed(`${source.id}->${targetId}:adhoc`));
        const { pts } = adHocHyphaPoints(source, target, vertical, rnd, nodes);
        return `<path class="edge adhoc-connection" d="${moldSmooth(pts)}"/>`;
      });
    }).join("");

    branches = nodes.filter((n) => n.parent && byId[n.parent]).map((n) => {
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
  } else {
    mainConnections = roots.slice(1).map((n, i) => {
      const parent = roots[i];
      const grow = linkGrow(parent.t, n.t, cursor);
      return mainThreadMarkup(parent, n, grow, ageOpacity(n.t, ageScale));
    }).join("");
    const drawnAdHocLinks = new Set();
    adHocConnections = nodes.flatMap((source) => {
      const targets = Array.isArray(source.connections) ? source.connections : [];
      return targets.flatMap((targetId) => {
        const target = byId[targetId];
        const key = [source.id, targetId].sort().join("::");
        if (!target || source.id === targetId || drawnAdHocLinks.has(key)) return [];
        drawnAdHocLinks.add(key);
        const earlier = source.t <= target.t ? source : target;
        const later = earlier === source ? target : source;
        const grow = linkGrow(earlier.t, later.t, cursor);
        return adHocMarkup(earlier, later, vertical, nodes, grow, 0.85);
      });
    }).join("");
    branches = nodes.filter((n) => n.parent && byId[n.parent]).map((n) => {
      const parent = byId[n.parent];
      const grow = linkGrow(parent.t, n.t, cursor);
      const fork = forkMarkup(parent, n, vertical, grow, ageOpacity(n.t, ageScale), n.id);
      if (fork.gradient) branchGradients.push(fork.gradient);
      return fork.svg;
    }).join("");
  }

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
    if (plus && !revealedAt(n.t, cursor)) return "";
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
    const aged = plus ? ` class="node${hub ? " hub" : ""}${ageClass(n.t, ageScale)}"` : ` class="node${hub ? " hub" : ""}"`;
    const shape = plus
      ? `<g style="opacity:${fmt(ageOpacity(n.t, ageScale))}">${nodeShape(n, opts.nodes)}</g>`
      : nodeShape(n, opts.nodes);
    return `<g${aged} tabindex="0" role="button" data-id="${escapeHtml(n.id)}" data-depth="${n.depth || 0}">
      <title>${escapeHtml(n.title || "")} · ${escapeHtml(n.started || "undated")}</title>
      ${anchor}
      ${shape}
      ${nodeLabel(n, opts)}
    </g>`;
  }).join("");

  svg.setAttribute("viewBox", `0 0 ${sceneW} ${sceneH}`);
  svg.setAttribute("width", String(sceneW));
  svg.setAttribute("height", String(sceneH));
  svg.style.aspectRatio = `${sceneW} / ${sceneH}`;
  svg.setAttribute("data-time-layout", plus ? "spine-plus" : "spine");
  svg.setAttribute("aria-label", plus ? SCENE_LABEL["spine-plus"] : SCENE_LABEL.spine);
  svg.innerHTML = defs + spineLine + arrow + ticks + dates + caption + durationSvg + mainAtmosphere.join("") + mainConnections + branches + adHocConnections + dots;
  bindGraphNodes(svg);
  syncGrowthControls();
}

function assignAngles(projects) {
  const { children } = indexProjects(projects);
  const angles = {};
  const roots = children[null] || [];
  const weight = (id) => 1 + (children[id] || []).reduce((sum, kid) => sum + weight(kid.id), 0);
  const total = roots.reduce((sum, root) => sum + weight(root.id), 0) || 1;
  const gap = 0.62;
  const usable = Math.max(0.8, Math.PI * 2 - gap * Math.max(1, roots.length));
  let cursor = -Math.PI / 2;
  const place = (node, a0, a1) => {
    const kids = children[node.id] || [];
    const mid = (a0 + a1) / 2;
    angles[node.id] = mid;
    if (!kids.length || a1 - a0 < 0.08) return;
    const notch = Math.min(0.38, Math.max(0.16, (a1 - a0) * 0.14));
    const right = [];
    const left = [];
    kids.forEach((kid, index) => (index % 2 === 0 ? right : left).push(kid));
    const spread = (list, s0, s1) => {
      if (!list.length) return;
      if (s1 - s0 < 0.12) {
        list.forEach((kid, index) => {
          const shift = (index - (list.length - 1) / 2) * 0.16;
          angles[kid.id] = (s0 + s1) / 2 + shift;
          place(kid, angles[kid.id] - 0.04, angles[kid.id] + 0.04);
        });
        return;
      }
      const step = (s1 - s0) / list.length;
      list.forEach((kid, index) => place(kid, s0 + index * step, s0 + (index + 1) * step));
    };
    spread(right, mid + notch, a1);
    spread(left, a0, mid - notch);
  };
  roots.forEach((root) => {
    const slice = usable * (weight(root.id) / total);
    place(root, cursor, cursor + Math.max(0.2, slice));
    cursor += Math.max(0.2, slice) + gap;
  });
  projects.forEach((project, index) => {
    if (angles[project.id] == null) {
      angles[project.id] = -Math.PI / 2 + (index / Math.max(1, projects.length)) * Math.PI * 2;
    }
  });
  return angles;
}

function anchorForAngle(angle) {
  const c = Math.cos(angle);
  if (c > 0.42) return "start";
  if (c < -0.42) return "end";
  return "middle";
}

function placeRingLabels(nodes, frame) {
  const placed = [];
  const ordered = [...nodes].sort((a, b) => a.r - b.r || String(a.id).localeCompare(String(b.id)));
  for (const node of ordered) {
    const metrics = labelMetrics(node, node.depth === 0 ? 18 : 20);
    node.labelMetrics = metrics;
    let chosen = null;
    for (let attempt = 0; attempt < 20 && !chosen; attempt++) {
      const dir = attempt % 2 === 0 ? 1 : -1;
      const step = Math.floor(attempt / 2);
      const angle = node.angle + dir * step * 0.065;
      const dist = node.r + nodeRadius(node) + 18 + step * 12;
      const x = frame.cx + Math.cos(angle) * dist;
      const y = frame.cy + Math.sin(angle) * dist + (metrics.lines.length > 1 ? 0 : 4);
      const anchor = anchorForAngle(angle);
      const box = textBox(x, y, anchor, metrics.width, metrics.height);
      const hitLabel = placed.some((item) => boxesOverlap(item, box, 6));
      const hitNode = nodes.some((other) => circleHitsBox(other.x, other.y, nodeRadius(other) + 7, box, 3));
      const hitCore = circleHitsBox(frame.cx, frame.cy, frame.rInner * 0.9, box, 4);
      if (!hitLabel && !hitNode && !hitCore) chosen = { x, y, anchor, box };
    }
    if (!chosen) {
      const dist = frame.rOuter + 36 + metrics.height;
      const x = frame.cx + Math.cos(node.angle) * dist;
      const y = frame.cy + Math.sin(node.angle) * dist;
      const anchor = anchorForAngle(node.angle);
      chosen = { x, y, anchor, box: textBox(x, y, anchor, metrics.width, metrics.height) };
    }
    node.labelX = chosen.x;
    node.labelY = chosen.y;
    node.labelAnchor = chosen.anchor;
    node.labelBox = chosen.box;
    placed.push(chosen.box);
  }
  return placed;
}

function largestGapAngle(angles) {
  if (!angles.length) return 0.15;
  const sorted = [...angles].sort((a, b) => a - b);
  let best = -1;
  let mid = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + Math.PI * 2;
    if (b - a > best) {
      best = b - a;
      mid = a + (b - a) / 2;
    }
  }
  while (mid > Math.PI) mid -= Math.PI * 2;
  while (mid < -Math.PI) mid += Math.PI * 2;
  return mid;
}

function renderRings(projects) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  const narrow = isNarrow();
  const frame = narrow
    ? { cx: 270, cy: 292, rInner: 30, rOuter: 188 }
    : { cx: 450, cy: 430, rInner: 36, rOuter: 300 };
  const opts = skinOpts();
  const extent = growthExtent(projects);
  activeExtent = extent;
  const cursor = growthCursor(extent);
  const { depthOf } = indexProjects(projects);
  const angles = assignAngles(projects);
  const span = extent.tMax - extent.tMin || 1;
  const radiusAt = (t) => {
    const u = Math.max(0, Math.min(1, ((Number.isFinite(t) ? t : extent.tMax) - extent.tMin) / span));
    return frame.rInner + u * (frame.rOuter - frame.rInner);
  };
  const nodes = projects.map((project) => {
    const t = parseTime(project.started);
    const angle = angles[project.id];
    const r = radiusAt(t);
    const depth = depthOf(project.id);
    return {
      ...project,
      t,
      depth,
      side: depth === 0 ? 0 : 1,
      angle,
      r,
      x: frame.cx + Math.cos(angle) * r,
      y: frame.cy + Math.sin(angle) * r,
      vertical: false,
    };
  });
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const ageScale = ageScaleOf(nodes);
  const labelBoxes = placeRingLabels(nodes, frame);
  const bands = timeBands(extent.tMin, extent.tMax);
  const gapAngle = largestGapAngle(nodes.map((node) => node.angle));
  const ringObstacles = [
    ...labelBoxes,
    ...nodes.map((node) => ({
      x: node.x - nodeRadius(node) - 8,
      y: node.y - nodeRadius(node) - 8,
      width: (nodeRadius(node) + 8) * 2,
      height: (nodeRadius(node) + 8) * 2,
    })),
  ];
  const ringLabels = [];
  const missedLabels = [];
  const ringMarks = bands.map((band) => {
    const at = Math.max(band.start, extent.tMin);
    const r = Math.max(frame.rInner, radiusAt(at));
    const future = band.start > cursor + 1;
    const circle = `<circle class="ring-line${future ? " ring-future" : ""}" cx="${fmt(frame.cx)}" cy="${fmt(frame.cy)}" r="${fmt(r)}"/>`;
    let label = "";
    if (!future) {
      const metricsWidth = band.label.length * 7.3 + 4;
      let chosen = null;
      for (let attempt = 0; attempt < 18 && !chosen; attempt++) {
        const dir = attempt % 2 === 0 ? 1 : -1;
        const angle = gapAngle + dir * Math.floor(attempt / 2) * 0.08;
        const x = frame.cx + Math.cos(angle) * (r + 14);
        const y = frame.cy + Math.sin(angle) * (r + 14);
        const anchor = anchorForAngle(angle);
        const box = textBox(x, y, anchor, metricsWidth, 16);
        if (!ringObstacles.some((item) => boxesOverlap(item, box, 4))) chosen = { x, y, anchor, box };
      }
      if (chosen) {
        ringObstacles.push(chosen.box);
        label = `<text class="ring-label" x="${fmt(chosen.x)}" y="${fmt(chosen.y)}" text-anchor="${chosen.anchor}">${escapeHtml(band.label)}</text>`;
        ringLabels.push(chosen.box);
      } else missedLabels.push(band.label);
    }
    return circle + label;
  }).join("");
  let columnX = frame.cx + frame.rOuter + 22;
  for (const box of ringObstacles) columnX = Math.max(columnX, box.x + box.width + 16);
  const missedSvg = missedLabels.map((text, index) => {
    const y = frame.cy - ((missedLabels.length - 1) * 18) / 2 + index * 18;
    const box = textBox(columnX, y, "start", text.length * 7.3 + 4, 16);
    ringLabels.push(box);
    return `<text class="ring-label" x="${fmt(columnX)}" y="${fmt(y)}" text-anchor="start">${escapeHtml(text)}</text>`;
  }).join("");
  const frontR = radiusAt(cursor);
  const front = `<circle class="ring-front" cx="${fmt(frame.cx)}" cy="${fmt(frame.cy)}" r="${fmt(frontR)}"/>`;
  const core = {
    id: "time-core",
    x: frame.cx,
    y: frame.cy,
    depth: 0,
    side: 0,
    t: extent.tMin,
  };
  const gradients = [];
  const roots = nodes.filter((node) => node.depth === 0);
  const trunks = roots.map((node) => {
    const grow = linkGrow(extent.tMin, node.t, cursor);
    const fork = forkMarkup(core, node, false, grow, ageOpacity(node.t, ageScale), `core-${node.id}`);
    if (fork.gradient) gradients.push(fork.gradient);
    return fork.svg;
  }).join("");
  const branches = nodes.filter((node) => node.parent && byId[node.parent]).map((node) => {
    const parent = byId[node.parent];
    const grow = linkGrow(parent.t, node.t, cursor);
    const fork = forkMarkup(parent, node, false, grow, ageOpacity(node.t, ageScale), node.id);
    if (fork.gradient) gradients.push(fork.gradient);
    return fork.svg;
  }).join("");
  const seen = new Set();
  const adHoc = nodes.flatMap((source) => (Array.isArray(source.connections) ? source.connections : []).flatMap((targetId) => {
    const target = byId[targetId];
    const key = [source.id, targetId].sort().join("::");
    if (!target || source.id === targetId || seen.has(key)) return [];
    seen.add(key);
    const earlier = source.t <= target.t ? source : target;
    const later = earlier === source ? target : source;
    return adHocMarkup(earlier, later, false, nodes, linkGrow(earlier.t, later.t, cursor), 0.8);
  })).join("");
  const coreBlob = `<path class="orb orb-blob time-core" style="fill: url(#hubBlobGradient); opacity:0.9" d="${organicBlob(frame.cx, frame.cy, 12.5, "time-core")}"/>`;
  const dots = nodes.map((node) => {
    if (!revealedAt(node.t, cursor)) return "";
    const hub = node.depth === 0;
    return `<g class="node${hub ? " hub" : ""}${ageClass(node.t, ageScale)}" tabindex="0" role="button" data-id="${escapeHtml(node.id)}" data-depth="${node.depth || 0}">
      <title>${escapeHtml(node.title || "")} · ${escapeHtml(node.started || "undated")}</title>
      <g style="opacity:${fmt(ageOpacity(node.t, ageScale))}">${nodeShape(node, opts.nodes)}</g>
      ${labelMarkup(node, node.labelX, node.labelY, node.labelAnchor)}
    </g>`;
  }).join("");
  const boxes = [...labelBoxes, ...ringLabels];
  let minX = frame.cx - frame.rOuter - 28;
  let minY = frame.cy - frame.rOuter - 28;
  let maxX = frame.cx + frame.rOuter + 28;
  let maxY = frame.cy + frame.rOuter + 28;
  for (const box of boxes) {
    minX = Math.min(minX, box.x - 10);
    minY = Math.min(minY, box.y - 10);
    maxX = Math.max(maxX, box.x + box.width + 12);
    maxY = Math.max(maxY, box.y + box.height + 14);
  }
  setScene(svg, minX, minY, maxX - minX, maxY - minY, "radial", "rings");
  svg.innerHTML = baseDefs(gradients.join(""), opts.glow) + ringMarks + missedSvg + front + trunks + branches + adHoc + coreBlob + dots;
  bindGraphNodes(svg);
  syncGrowthControls();
}

function layoutStrata(projects) {
  const narrow = isNarrow();
  const extent = growthExtent(projects);
  const bands = timeBands(extent.tMin, extent.tMax);
  const bandH = narrow ? 168 : 176;
  const padTop = 20;
  const padBottom = 36;
  const t0 = bands[0].start;
  const t1 = bands[bands.length - 1].end + 1;
  const yAt = (t) => padTop + ((t - t0) / (t1 - t0 || 1)) * (bands.length * bandH);
  const { children, depthOf } = indexProjects(projects);
  const nodes = projects.map((project) => {
    const depth = depthOf(project.id);
    return {
      ...project,
      t: parseTime(project.started),
      depth,
      lane: 0,
      side: depth === 0 ? 0 : 1,
      vertical: true,
    };
  });
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const walk = (project, lane) => {
    const node = byId[project.id];
    node.lane = lane;
    node.side = lane === 0 ? 0 : 1;
    (children[project.id] || []).forEach((kid) => walk(kid, lane + 1));
  };
  (children[null] || []).forEach((root) => walk(root, 0));
  nodes.forEach((node) => {
    node.y = Number.isFinite(node.t) ? yAt(node.t) : yAt(extent.tMax);
    node.main = node.y;
  });
  const minDy = narrow ? 66 : 74;
  let guard = 0;
  let moved = true;
  while (moved && guard < 16) {
    moved = false;
    guard += 1;
    const ordered = [...nodes].sort((a, b) => a.y - b.y || a.lane - b.lane || String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < i; j++) {
        if (ordered[i].lane !== ordered[j].lane) continue;
        if (Math.abs(ordered[i].y - ordered[j].y) >= minDy) continue;
        ordered[i].lane += 1;
        ordered[i].side = 1;
        moved = true;
      }
    }
  }
  const gutter = narrow ? 92 : 126;
  const pitch = narrow ? 112 : 186;
  let maxLane = 0;
  nodes.forEach((node) => { maxLane = Math.max(maxLane, node.lane); });
  nodes.forEach((node) => {
    node.x = gutter + 36 + node.lane * pitch;
    node.spine = gutter - 16;
  });
  const obstacles = bands.map((band, index) => {
    const width = band.label.length * 7.5 + 6;
    return { x: 12, y: padTop + index * bandH + 6, width, height: 18 };
  });
  const ordered = [...nodes].sort((a, b) => a.y - b.y || a.lane - b.lane);
  for (const node of ordered) {
    const metrics = labelMetrics(node, narrow ? (node.depth === 0 ? 14 : 12) : (node.depth === 0 ? 22 : 20));
    node.labelMetrics = metrics;
    let x = node.x + nodeRadius(node) + 12;
    let y = node.y + 4;
    let chosen = null;
    for (let attempt = 0; attempt < 12 && !chosen; attempt++) {
      const box = textBox(x, y, "start", metrics.width, metrics.height);
      const hit = obstacles.some((item) => boxesOverlap(item, box, 6));
      const hitNode = nodes.some((other) => other.id !== node.id && circleHitsBox(other.x, other.y, nodeRadius(other) + 6, box, 2));
      if (!hit && !hitNode) chosen = { x, y, box };
      else if (attempt % 2 === 0) y += 14;
      else x += 22;
    }
    if (!chosen) chosen = { x, y, box: textBox(x, y, "start", metrics.width, metrics.height) };
    node.labelX = chosen.x;
    node.labelY = chosen.y;
    node.labelAnchor = "start";
    node.labelBox = chosen.box;
    obstacles.push(chosen.box);
  }
  const maxRight = obstacles.reduce((max, box) => Math.max(max, box.x + box.width), 0);
  const w = Math.max(narrow ? 360 : 520, maxRight + 28);
  const h = padTop + bands.length * bandH + padBottom;
  return { w, h, nodes, byId, bands, padTop, bandH, extent, yAt, gutter };
}

function renderStrata(projects) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  const opts = skinOpts();
  const scene = layoutStrata(projects);
  const { w, h, nodes, byId, bands, padTop, bandH, extent, yAt, gutter } = scene;
  activeExtent = extent;
  const cursor = growthCursor(extent);
  const ageScale = ageScaleOf(nodes);
  const frontY = yAt(Math.max(extent.tMin, Math.min(extent.tMax, cursor)));
  const strata = bands.map((band, index) => {
    const y = padTop + index * bandH;
    const future = band.start > cursor + 1 ? " stratum-future" : "";
    return `<rect class="stratum ${index % 2 ? "stratum-b" : "stratum-a"}${future}" x="0" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(bandH)}"/>
      <text class="stratum-label" x="14" y="${fmt(y + 20)}" text-anchor="start" style="opacity:${band.start > cursor + 1 ? 0.35 : 0.92}">${escapeHtml(band.label)}</text>`;
  }).join("");
  const cordX = Math.max(78, gutter - 18);
  const cordTop = padTop + 16;
  const cordBot = Math.max(cordTop + 8, frontY);
  const cordPts = [
    { x: cordX, y: cordTop },
    { x: cordX + 7, y: (cordTop + cordBot) / 2 },
    { x: cordX - 3, y: cordBot },
  ];
  const cord = `<path class="edge mold-ribbon mold-ribbon-main" style="fill: var(--branch); opacity:0.55" filter="url(#hyphaTexture)" d="${ribbonOutline(cordPts, 0, 1, () => 5.2)}"/>`;
  const gradients = [];
  const roots = nodes.filter((node) => node.depth === 0);
  const trunks = roots.map((node) => {
    if (!revealedAt(node.t, cursor)) return "";
    const sprout = { id: "soil-cord", x: cordX, y: node.y, depth: 0, side: 0, t: extent.tMin };
    const fork = forkMarkup(sprout, node, true, 1, ageOpacity(node.t, ageScale), `soil-${node.id}`);
    if (fork.gradient) gradients.push(fork.gradient);
    return fork.svg;
  }).join("");
  const branches = nodes.filter((node) => node.parent && byId[node.parent]).map((node) => {
    const parent = byId[node.parent];
    const grow = linkGrow(parent.t, node.t, cursor);
    const fork = forkMarkup(parent, node, true, grow, ageOpacity(node.t, ageScale), node.id);
    if (fork.gradient) gradients.push(fork.gradient);
    return fork.svg;
  }).join("");
  const seen = new Set();
  const adHoc = nodes.flatMap((source) => (Array.isArray(source.connections) ? source.connections : []).flatMap((targetId) => {
    const target = byId[targetId];
    const key = [source.id, targetId].sort().join("::");
    if (!target || source.id === targetId || seen.has(key)) return [];
    seen.add(key);
    const earlier = source.t <= target.t ? source : target;
    const later = earlier === source ? target : source;
    return adHocMarkup(earlier, later, true, nodes, linkGrow(earlier.t, later.t, cursor), 0.8);
  })).join("");
  const dots = nodes.map((node) => {
    if (!revealedAt(node.t, cursor)) return "";
    const hub = node.depth === 0;
    return `<g class="node${hub ? " hub" : ""}${ageClass(node.t, ageScale)}" tabindex="0" role="button" data-id="${escapeHtml(node.id)}" data-depth="${node.depth || 0}">
      <title>${escapeHtml(node.title || "")} · ${escapeHtml(node.started || "undated")}</title>
      <g style="opacity:${fmt(ageOpacity(node.t, ageScale))}">${nodeShape(node, opts.nodes)}</g>
      ${labelMarkup(node, node.labelX, node.labelY, node.labelAnchor)}
    </g>`;
  }).join("");
  const frontLabel = growth >= 0.999 ? "now" : formatISO(cursor);
  const front = `<line class="growth-front" x1="8" y1="${fmt(frontY)}" x2="${fmt(w - 8)}" y2="${fmt(frontY)}"/>
    <text class="growth-front-label" x="${fmt(w - 12)}" y="${fmt(frontY - 8)}" text-anchor="end">${escapeHtml(frontLabel)}</text>`;
  setScene(svg, 0, 0, w, h, "vertical", "strata");
  svg.innerHTML = baseDefs(gradients.join(""), opts.glow) + strata + cord + trunks + branches + adHoc + dots + front;
  bindGraphNodes(svg);
  syncGrowthControls();
}

function syncGrowthControls() {
  const play = document.getElementById("growth-play");
  const scrub = document.getElementById("growth-scrub");
  const readout = document.getElementById("growth-readout");
  if (play) {
    const reduced = prefersReducedMotion();
    play.textContent = growthPlaying ? "Pause" : (reduced ? (growth >= 0.999 ? "Restart" : "End") : "Play");
    play.setAttribute("aria-pressed", growthPlaying ? "true" : "false");
    play.setAttribute("aria-label", reduced
      ? (growth >= 0.999 ? "Jump to the start of growth" : "Jump to now")
      : (growthPlaying ? "Pause growth" : "Play growth"));
  }
  if (scrub && document.activeElement !== scrub) scrub.value = String(Math.round(Math.max(0, Math.min(1, growth)) * 1000));
  if (readout) {
    if (!activeExtent) readout.textContent = growth >= 0.999 ? "now" : "";
    else {
      const t = growthCursor(activeExtent);
      const label = growth >= 0.999 ? "now" : formatISO(t);
      readout.textContent = label;
      if (scrub) scrub.setAttribute("aria-valuetext", label);
    }
  }
}

function syncGrowthChrome() {
  const box = document.getElementById("growth");
  if (!box) return;
  const about = document.getElementById("about");
  const aboutOpen = about && !about.classList.contains("hidden");
  box.hidden = aboutOpen || currentTimeLayout() === "spine";
}

function stopGrowth() {
  growthPlaying = false;
  if (growthRaf) cancelAnimationFrame(growthRaf);
  growthRaf = 0;
  syncGrowthControls();
}

function playGrowth() {
  if (currentTimeLayout() === "spine") return;
  if (growthPlaying) {
    stopGrowth();
    return;
  }
  if (prefersReducedMotion()) {
    growth = growth >= 0.999 ? 0 : 1;
    syncGrowthControls();
    if (projectsCache.length) renderGraph(projectsCache);
    return;
  }
  if (growth >= 0.999) growth = 0;
  growthPlaying = true;
  syncGrowthControls();
  const from = growth;
  const startedAt = performance.now();
  const duration = 9000;
  const step = (now) => {
    if (!growthPlaying) return;
    if (prefersReducedMotion()) {
      growth = 1;
      stopGrowth();
      if (projectsCache.length) renderGraph(projectsCache);
      return;
    }
    const u = Math.min(1, (now - startedAt) / duration);
    const eased = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
    growth = from + (1 - from) * eased;
    syncGrowthControls();
    if (projectsCache.length) renderGraph(projectsCache);
    if (u < 1) growthRaf = requestAnimationFrame(step);
    else stopGrowth();
  };
  growthRaf = requestAnimationFrame(step);
}

function readTimeLayout() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("time");
    if (TIME_LAYOUTS.includes(requested)) return requested;
  } catch (err) {
    /* keep the spine */
  }
  return DEFAULT_TIME_LAYOUT;
}

function writeTimeUrl() {
  const url = new URL(window.location.href);
  if (timeLayout === DEFAULT_TIME_LAYOUT) url.searchParams.delete("time");
  else url.searchParams.set("time", timeLayout);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) history.replaceState(null, "", next);
}

function applyTimeLayout(mode, opts) {
  timeLayout = TIME_LAYOUTS.includes(mode) ? mode : DEFAULT_TIME_LAYOUT;
  document.documentElement.setAttribute("data-time-layout", timeLayout === DEFAULT_TIME_LAYOUT ? "" : timeLayout);
  if (timeLayout === DEFAULT_TIME_LAYOUT) document.documentElement.removeAttribute("data-time-layout");
  document.querySelectorAll(".time-layout-btn").forEach((btn) => {
    const on = btn.getAttribute("data-time-layout") === timeLayout;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const lede = document.querySelector(".lede");
  if (lede) lede.textContent = TIME_LEDE[timeLayout] || TIME_LEDE.spine;
  if (!opts || !opts.keepGrowth) {
    stopGrowth();
    growth = 1;
  }
  syncGrowthChrome();
  syncGrowthControls();
  if (!(opts && opts.skipUrl)) writeTimeUrl();
  if (projectsCache.length && !(opts && opts.silent)) renderGraph(projectsCache);
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
  if (projectsCache.length && currentTimeLayout() !== "spine") renderGraph(projectsCache);
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
    const timeSwitch = document.getElementById("time-layout");
    const growthBox = document.getElementById("growth");
    if (btn.dataset.tab === "about") {
      about.classList.remove("hidden");
      graph.classList.add("hidden");
      cards.classList.add("hidden");
      cardsToggle.classList.add("hidden");
      timeSwitch.classList.add("hidden");
      growthBox.classList.add("hidden");
      stopGrowth();
    } else {
      about.classList.add("hidden");
      graph.classList.remove("hidden");
      cards.classList.remove("hidden");
      cardsToggle.classList.remove("hidden");
      timeSwitch.classList.remove("hidden");
      syncGrowthChrome();
    }
  });
});

window.addEventListener("resize", () => {
  if (!projectsCache.length) return;
  if (currentTimeLayout() === "spine") {
    const next = preferredOrient();
    if (next !== orientMode) renderGraph(projectsCache);
    return;
  }
  const narrow = isNarrow();
  if (narrow !== layoutNarrow) {
    layoutNarrow = narrow;
    renderGraph(projectsCache);
  }
});

document.getElementById("cards-toggle").addEventListener("click", toggleAllCards);
document.getElementById("look-toggle").addEventListener("click", toggleLook);
document.querySelectorAll(".time-layout-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.getAttribute("data-time-layout");
    if (next === currentTimeLayout()) return;
    applyTimeLayout(next);
  });
});
document.getElementById("growth-play").addEventListener("click", playGrowth);
document.getElementById("growth-scrub").addEventListener("input", () => {
  stopGrowth();
  const scrub = document.getElementById("growth-scrub");
  growth = Number(scrub.value) / 1000;
  syncGrowthControls();
  if (projectsCache.length) renderGraph(projectsCache);
});
document.getElementById("graph").addEventListener("click", (event) => {
  const span = event.target.closest("[data-span]");
  if (!span) return;
  selectNode(span.getAttribute("data-span"));
});

layoutNarrow = isNarrow();
applyTimeLayout(readTimeLayout(), { skipUrl: true, silent: true });
lockLook();
load();
