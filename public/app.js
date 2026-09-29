function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
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
  const padY = 48;
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

  // Assign lanes within each level (alternate around spine)
  const nodes = {};
  const laneCounters = {};
  function place(p) {
    const level = levels[p.id] || 0;
    laneCounters[level] = (laneCounters[level] || 0) + 1;
    const lane = laneCounters[level];
    const siblings = (children[p.parent && byId[p.parent] ? p.parent : null] || []).length || 1;
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

  // Spine follows chronological roots left→right through deepest path
  const ordered = Object.values(nodes).sort((a, b) => a.level - b.level || a.x - b.x);
  return { w, h, padX, padY, nodes: ordered, byId: nodes, children };
}

function renderGraph(projects) {
  const svg = document.getElementById("graph");
  const { w, h, padX, nodes, byId } = layout(projects);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const spineY = h / 2;
  const maxX = Math.max(...nodes.map((n) => n.x), padX + 40);
  const defs = `<defs>
    <linearGradient id="spineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5cf6ff" stop-opacity="0.15"/>
      <stop offset="45%" stop-color="#5cf6ff"/>
      <stop offset="100%" stop-color="#ff4fd8" stop-opacity="0.55"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  const spine = `<line class="spine" x1="${padX - 12}" y1="${spineY}" x2="${maxX + 24}" y2="${spineY}"
    stroke="url(#spineGrad)" stroke-width="3" stroke-linecap="round" />`;

  const branches = nodes.map((n) => {
    if (!n.parent || !byId[n.parent]) {
      return `<path d="M ${n.x} ${spineY} Q ${n.x} ${(spineY + n.y) / 2} ${n.x} ${n.y}"
        fill="none" stroke="#c77dff" stroke-width="2" opacity="0.9" filter="url(#glow)"/>`;
    }
    const parent = byId[n.parent];
    const mx = (parent.x + n.x) / 2;
    return `<path d="M ${parent.x} ${parent.y} C ${mx} ${parent.y}, ${mx} ${n.y}, ${n.x} ${n.y}"
      fill="none" stroke="#c77dff" stroke-width="2" opacity="0.9" filter="url(#glow)"/>`;
  }).join("");

  const dots = nodes.map((n) => {
    const label = escapeHtml((n.title || "").slice(0, 26));
    const ty = n.side < 0 ? n.y - 16 : n.y + 24;
    return `<g class="node" tabindex="0" role="button" data-id="${escapeHtml(n.id)}">
      <circle class="anchor" cx="${n.x}" cy="${spineY}" r="3.5" fill="#5cf6ff" opacity="0.7"/>
      <circle class="orb" cx="${n.x}" cy="${n.y}" r="9" fill="#ff4fd8" stroke="#e8f0ff" stroke-width="1.5" filter="url(#glow)"/>
      <text x="${n.x}" y="${ty}" text-anchor="middle" fill="#e8f0ff" font-size="11">${label}</text>
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

async function load() {
  try {
    const res = await fetch("./data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const projects = data.projects || [];
    renderGraph(projects);
    renderCards(projects);
  } catch (err) {
    document.getElementById("cards").innerHTML =
      `<p style="color:#8090b8">Could not load data (${escapeHtml(String(err))})</p>`;
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

load();
