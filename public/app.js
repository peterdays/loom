const SKIN_KEY = "loom-skin";
const DEFAULT_SKIN = "ink-schematic";
const SKINS = {
  neon: { edges: "curve", nodes: "circle", glow: true, dashed: false },
  circuit: { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  blueprint: { edges: "ortho", nodes: "circle", glow: false, dashed: true },
  obsidian: { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  ink: { edges: "curve", nodes: "diamond", glow: false, dashed: false },
  "ink-ortho": { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  "ink-schematic": { edges: "ortho", nodes: "rect", glow: false, dashed: false, stamp: true },
  "ink-brutal": { edges: "ortho", nodes: "rect", glow: false, dashed: false },
  "ink-sepia": { edges: "ortho", nodes: "diamond", glow: false, dashed: false },
};

let projectsCache = [];

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

function layout(projects) {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const children = {};
  for (const p of projects) {
    const parent = p.parent && byId[p.parent] ? p.parent : null;
    if (!children[parent]) children[parent] = [];
    children[parent].push(p);
  }
  for (const k of Object.keys(children)) {
    children[k].sort((a, b) =>
      String(a.started || "9999").localeCompare(String(b.started || "9999"))
    );
  }

  const w = 980;
  const h = 460;
  const padX = 56;
  const levels = {};
  const queue = [...(children[null] || [])];
  for (const p of queue) levels[p.id] = 0;
  while (queue.length) {
    const cur = queue.shift();
    for (const kid of children[cur.id] || []) {
      levels[kid.id] = levels[cur.id] + 1;
      queue.push(kid);
    }
  }
  const maxLevel = Math.max(0, ...Object.values(levels));
  const levelGap = maxLevel === 0 ? 0 : (w - padX * 2) / maxLevel;

  const nodes = {};
  const laneCounters = {};
  function place(p) {
    const level = levels[p.id] || 0;
    laneCounters[level] = (laneCounters[level] || 0) + 1;
    const lane = laneCounters[level];
    const side = lane % 2 === 0 ? 1 : -1;
    const row = Math.ceil(lane / 2);
    const x = padX + level * levelGap;
    const y = h / 2 + side * (52 + (row - 1) * 64);
    nodes[p.id] = { ...p, x, y, level, side };
  }
  function walk(list) {
    for (const p of list) {
      place(p);
      walk(children[p.id] || []);
    }
  }
  walk(children[null] || []);

  const ordered = Object.values(nodes).sort((a, b) => a.level - b.level || a.x - b.x);
  return { w, h, padX, nodes: ordered, byId: nodes, children };
}

function orthoPath(x1, y1, x2, y2) {
  const mx = Math.round((x1 + x2) / 2);
  return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
}

function curvePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function edgePath(x1, y1, x2, y2, mode) {
  return mode === "ortho" ? orthoPath(x1, y1, x2, y2) : curvePath(x1, y1, x2, y2);
}

function nodeShape(n, kind) {
  const r = 9;
  if (kind === "rect") {
    const s = r * 1.6;
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
  const label = escapeHtml((n.title || "").slice(0, 26));
  if (opts.stamp) {
    const tw = Math.max(36, label.length * 6.4 + 8);
    const th = 15;
    const tx = n.x - tw / 2;
    const tyBox = n.side < 0 ? n.y - 30 : n.y + 14;
    return `<g class="stamp-label">
      <rect class="stamp" x="${tx}" y="${tyBox}" width="${tw}" height="${th}"/>
      <text x="${n.x}" y="${tyBox + 11}" text-anchor="middle" font-size="9">${label}</text>
    </g>`;
  }
  const ty = n.side < 0 ? n.y - 16 : n.y + 24;
  return `<text x="${n.x}" y="${ty}" text-anchor="middle" font-size="11">${label}</text>`;
}

function renderGraph(projects) {
  const svg = document.getElementById("graph");
  if (!svg) return;
  const { w, h, padX, nodes, byId } = layout(projects);
  const opts = skinOpts();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("data-edge-mode", opts.edges);

  const spineY = h / 2;
  const maxX = Math.max(...nodes.map((n) => n.x), padX + 40);
  const dash = opts.dashed ? ' stroke-dasharray="6 4"' : "";
  const glowFilter = opts.glow
    ? `<filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";

  const defs = `<defs>
    <linearGradient id="spineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="var(--spine)" stop-opacity="0.2"/>
      <stop offset="45%" stop-color="var(--spine)"/>
      <stop offset="100%" stop-color="var(--node)" stop-opacity="0.6"/>
    </linearGradient>
    ${glowFilter}
  </defs>`;

  const spine = `<line class="spine-line" x1="${padX - 12}" y1="${spineY}" x2="${maxX + 24}" y2="${spineY}"
    stroke="url(#spineGrad)" stroke-linecap="${opts.edges === "ortho" ? "square" : "round"}"${dash}/>`;

  const branches = nodes.map((n) => {
    let x1, y1;
    if (!n.parent || !byId[n.parent]) {
      x1 = n.x;
      y1 = spineY;
    } else {
      const parent = byId[n.parent];
      x1 = parent.x;
      y1 = parent.y;
    }
    const d = edgePath(x1, y1, n.x, n.y, opts.edges);
    const filt = opts.glow ? ' filter="url(#glow)"' : "";
    return `<path class="edge" d="${d}" opacity="0.92"${dash}${filt}/>`;
  }).join("");

  const dots = nodes.map((n) => {
    const hard = opts.nodes === "rect" || opts.edges === "ortho";
    const anchor = hard
      ? `<rect class="anchor" x="${n.x - 3}" y="${spineY - 3}" width="6" height="6" opacity="0.75"/>`
      : `<circle class="anchor" cx="${n.x}" cy="${spineY}" r="3.5" opacity="0.7"/>`;
    return `<g class="node" tabindex="0" role="button" data-id="${escapeHtml(n.id)}">
      ${anchor}
      ${nodeShape(n, opts.nodes)}
      ${nodeLabel(n, opts)}
    </g>`;
  }).join("");

  svg.innerHTML = defs + spine + branches + dots;
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
}

function selectNode(id) {
  document.querySelectorAll(".node").forEach((n) => {
    n.classList.toggle("active", n.getAttribute("data-id") === id);
  });
  document.querySelectorAll(".card").forEach((c) => {
    const on = c.id === `card-${id}`;
    c.classList.toggle("active", on);
    if (on) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
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
      : `<div class="fork">root on spine</div>`;
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

initSkinSwitcher();
load();
