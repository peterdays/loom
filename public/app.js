const SKIN_KEY = "loom-skin";
const DEFAULT_SKIN = "ink-schematic";
const SKINS = {
  neon: { edges: "curve", nodes: "circle", glow: true, dashed: false },
  circuit: { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  blueprint: { edges: "ortho", nodes: "circle", glow: false, dashed: true },
  obsidian: { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  ink: { edges: "curve", nodes: "diamond", glow: false, dashed: false },
  "ink-ortho": { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  "ink-schematic": { edges: "mold", nodes: "rect", glow: false, dashed: false, stamp: true },
  "ink-brutal": { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  "ink-sepia": { edges: "ortho", nodes: "diamond", glow: false, dashed: false },
};

let projectsCache = [];
let activeId = null;
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
 * Open curve through pts. Tension is tight (÷8, not ÷6) so the hypha
 * follows the samples instead of looping back across the time spine.
 */
function moldSmooth(pts) {
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

/**
 * Organic fork from parent → child. Primary forks peel off the straight
 * time spine, then meander like a hypha (alternating bends, uneven spacing).
 * Nested sibling lanes use a smaller amplitude. RNG is seeded only from the
 * child project id, so a reload draws the same curve.
 */
function moldFork(p, c, vertical) {
  const rnd = mulberry32(hashSeed(String(c.id || "")));
  const nested = (p.side || 0) !== 0;
  const spine = p.spine ?? (vertical ? p.x : p.y);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;

  let outX = 0;
  let outY = 0;
  if (vertical) outX = Math.sign(c.x - spine) || 1;
  else outY = Math.sign(c.y - spine) || Math.sign(c.side) || -1;

  // Peel off the spine before wandering. Downward forks clear the date labels.
  let peel = 0;
  if (!nested) peel = vertical ? 28 : (outY > 0 ? 46 : 26);
  peel = Math.min(peel, dist * 0.4);
  const amp = nested
    ? Math.min(9, 4 + dist * 0.03)
    : Math.min(26, 12 + dist * 0.028);

  const pts = [{ x: p.x, y: p.y }];
  const latX = vertical ? 0 : 1;
  const latY = vertical ? 1 : 0;
  if (peel > 6) {
    const j1 = (rnd() * 2 - 1) * Math.min(8, amp * 0.45);
    const j2 = (rnd() * 2 - 1) * Math.min(6, amp * 0.28);
    pts.push({
      x: p.x + outX * peel * 0.38 + latX * j1,
      y: p.y + outY * peel * 0.38 + latY * j1,
    });
    pts.push({
      x: p.x + outX * peel * 0.78 + latX * j2 * 0.35,
      y: p.y + outY * peel * 0.78 + latY * j2 * 0.35,
    });
    pts.push({
      x: p.x + outX * peel + latX * j2,
      y: p.y + outY * peel + latY * j2,
    });
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
  const nMid = el < 80 ? 2 : el < 180 ? 3 : el < 360 ? 4 : 5;
  let prevT = 0.06;
  for (let i = 1; i <= nMid; i++) {
    const t = i / (nMid + 1);
    const tt = Math.min(0.92, Math.max(prevT + 0.08, t + (rnd() - 0.5) * 0.12));
    prevT = tt;
    const taper = Math.sin(Math.PI * tt);
    const side = i % 2 === 0 ? 1 : -1;
    const gain = 0.4 + rnd() * 0.75;
    const w = side * gain * amp * taper;
    const outwardBoost = (0.12 + rnd() * 0.38) * amp * taper * (nested ? 0.2 : 1);
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
  return moldSmooth(pts);
}

function nodeShape(n, kind) {
  const r = 8;
  if (kind === "rect") {
    const s = 13;
    return `<rect class="orb" x="${n.x - s / 2}" y="${n.y - s / 2}" width="${s}" height="${s}"/>`;
  }
  if (kind === "diamond") {
    const s = r + 2;
    return `<polygon class="orb" points="${n.x},${n.y - s} ${n.x + s},${n.y} ${n.x},${n.y + s} ${n.x - s},${n.y}"/>`;
  }
  const glow = skinOpts().glow ? ' filter="url(#glow)"' : "";
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
    const d = edgePath(parent, n, opts.edges, vertical);
    const filt = opts.glow ? ' filter="url(#glow)"' : "";
    // One extra static stroke (no animation) so the hypha reads as a thread, not a hairline.
    if (opts.edges === "mold") {
      return `<path class="edge mold-sheath" d="${d}"/><path class="edge" d="${d}"${dash}${filt}/>`;
    }
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
    const focus = () => selectNode(id);
    el.addEventListener("click", focus);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        focus();
      }
    });
  });
  if (activeId) applyActive(activeId, false);
}

function applyActive(id, scroll) {
  document.querySelectorAll(".node").forEach((n) => {
    n.classList.toggle("active", n.getAttribute("data-id") === id);
  });
  document.querySelectorAll(".card").forEach((c) => {
    const on = c.id === `card-${id}`;
    c.classList.toggle("active", on);
    if (on && scroll) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function selectNode(id) {
  activeId = id;
  applyActive(id, true);
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
    return `<article class="card" id="card-${escapeHtml(p.id || "")}" data-id="${escapeHtml(p.id || "")}">
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
  if (activeId) applyActive(activeId, false);
}

function applySkin(name, { persist = true } = {}) {
  if (!SKINS[name]) name = DEFAULT_SKIN;
  document.documentElement.setAttribute("data-skin", name);
  document.querySelectorAll(".skin-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.skin === name);
  });
  if (persist) {
    try { localStorage.setItem(SKIN_KEY, name); } catch (_) { /* ignore */ }
  }
  if (projectsCache.length) renderGraph(projectsCache);
}

function initSkinSwitcher() {
  let saved = DEFAULT_SKIN;
  try { saved = localStorage.getItem(SKIN_KEY) || DEFAULT_SKIN; } catch (_) { /* ignore */ }
  if (!SKINS[saved]) saved = DEFAULT_SKIN;
  applySkin(saved, { persist: false });

  document.querySelectorAll(".skin-btn").forEach((btn) => {
    btn.addEventListener("click", () => applySkin(btn.dataset.skin));
  });
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
    if (btn.dataset.tab === "about") {
      about.classList.remove("hidden");
      graph.classList.add("hidden");
      cards.classList.add("hidden");
    } else {
      about.classList.add("hidden");
      graph.classList.remove("hidden");
      cards.classList.remove("hidden");
    }
  });
});

window.addEventListener("resize", () => {
  const next = preferredOrient();
  if (next !== orientMode && projectsCache.length) renderGraph(projectsCache);
});

initSkinSwitcher();
load();
