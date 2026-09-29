function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function layout(projects) {
  const sorted = [...projects].sort((a, b) =>
    String(a.started || "9999").localeCompare(String(b.started || "9999"))
  );
  const w = 900;
  const h = 380;
  const padX = 60;
  const spineY = h * 0.42;
  const n = Math.max(sorted.length, 1);
  const nodes = sorted.map((p, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = padX + t * (w - padX * 2);
    const side = i % 2 === 0 ? -1 : 1;
    const branchLen = 70 + (i % 3) * 28;
    return {
      ...p,
      x,
      y: spineY + side * branchLen,
      anchorX: x,
      anchorY: spineY,
      side,
    };
  });
  return { w, h, spineY, padX, nodes };
}

function renderGraph(projects) {
  const svg = document.getElementById("graph");
  const { w, h, spineY, padX, nodes } = layout(projects);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const spine = `<line x1="${padX}" y1="${spineY}" x2="${w - padX}" y2="${spineY}"
    stroke="url(#spineGrad)" stroke-width="3" stroke-linecap="round" />`;
  const defs = `<defs>
    <linearGradient id="spineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5cf6ff" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#5cf6ff"/>
      <stop offset="100%" stop-color="#ff4fd8" stop-opacity="0.5"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  const branches = nodes.map((n) => {
    const midY = (n.anchorY + n.y) / 2;
    return `<path d="M ${n.anchorX} ${n.anchorY} Q ${n.anchorX + n.side * 12} ${midY} ${n.x} ${n.y}"
      fill="none" stroke="#c77dff" stroke-width="2" opacity="0.85" filter="url(#glow)"/>`;
  }).join("");
  const dots = nodes.map((n, i) => {
    const label = escapeHtml((n.title || "").slice(0, 28));
    const ty = n.side < 0 ? n.y - 14 : n.y + 22;
    return `<g class="node" data-id="${escapeHtml(n.id || String(i))}">
      <circle cx="${n.anchorX}" cy="${n.anchorY}" r="4" fill="#5cf6ff"/>
      <circle cx="${n.x}" cy="${n.y}" r="8" fill="#ff4fd8" stroke="#e8f0ff" stroke-width="1.5" filter="url(#glow)"/>
      <text x="${n.x}" y="${ty}" text-anchor="middle" fill="#e8f0ff" font-size="11">${label}</text>
    </g>`;
  }).join("");
  svg.innerHTML = defs + spine + branches + dots;
}

function renderCards(projects) {
  const root = document.getElementById("cards");
  const sorted = [...projects].sort((a, b) =>
    String(b.started || "").localeCompare(String(a.started || ""))
  );
  root.innerHTML = sorted.map((p) => {
    const when = p.ended ? `${p.started || "?"} → ${p.ended}` : (p.started || "ongoing");
    const tags = (p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    return `<article class="card" id="card-${escapeHtml(p.id || "")}">
      <div class="meta">${escapeHtml(when)}</div>
      <h2>${escapeHtml(p.title || "Untitled")}</h2>
      <p>${escapeHtml(p.summary || "")}</p>
      <div class="tags">${tags}</div>
    </article>`;
  }).join("");
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
