const DEFAULT_SKIN = "spores";
const DEFAULT_LOOK = "current";
const LOOK_STORAGE_KEY = "loom-look";
const DEFAULT_FORK_STYLE = "ribbon";

let projectsCache = [];
let activeId = null;
let showAllCards = false;

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
  if (toggle) toggle.setAttribute("aria-pressed", next === "white" ? "true" : "false");
  if (window.RadialGraph) RadialGraph.relayout();
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

/** Cards stay hidden until a node is chosen, or until every card is shown. */
function syncCards(scroll) {
  const toggle = document.getElementById("cards-toggle");
  if (toggle) {
    toggle.textContent = showAllCards ? "Hide node cards" : "Show all node cards";
    toggle.setAttribute("aria-pressed", showAllCards ? "true" : "false");
  }
  let scrolled = false;
  document.querySelectorAll(".card").forEach((c) => {
    const id = c.getAttribute("data-id");
    const selected = activeId != null && id === activeId;
    const visible = showAllCards || selected;
    c.classList.toggle("active", selected);
    c.setAttribute("aria-pressed", selected ? "true" : "false");
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
  syncCards(false);
  if (window.RadialGraph) RadialGraph.pin(id);
}

function toggleAllCards() {
  showAllCards = !showAllCards;
  if (!showAllCards) {
    activeId = null;
    if (window.RadialGraph) RadialGraph.pin(null);
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
    const when = p.ended
      ? `${p.started || "?"} → ${p.ended}`
      : p.ongoing
        ? `${p.started || "?"} → now`
        : (p.started || "undated");
    const tags = (p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const parentTitle = p.parent && byId[p.parent] ? byId[p.parent].title : null;
    const fork = parentTitle
      ? `<div class="fork">fork of ${escapeHtml(parentTitle)}</div>`
      : `<div class="fork">root project</div>`;
    const connections = (Array.isArray(p.connections) ? p.connections : [])
      .map((id) => byId[id] && byId[id].title)
      .filter(Boolean);
    const links = connections.length
      ? `<div class="connection">linked to ${connections.map((title) => escapeHtml(title)).join(", ")}</div>`
      : "";
    const selected = activeId != null && p.id === activeId;
    const visible = showAllCards || selected;
    return `<article class="card${selected ? " active" : ""}" id="card-${escapeHtml(p.id || "")}" data-id="${escapeHtml(p.id || "")}" tabindex="0" aria-pressed="${selected ? "true" : "false"}"${visible ? "" : " hidden"}>
      <div class="meta">${escapeHtml(when)}</div>
      ${fork}
      ${links}
      <h2>${escapeHtml(p.title || "Untitled")}</h2>
      <p>${linkifyPublicUrls(p.summary || "")}</p>
      <div class="tags">${tags}</div>
    </article>`;
  }).join("");
  root.querySelectorAll(".card").forEach((c) => {
    const choose = () => selectNode(c.getAttribute("data-id"));
    c.addEventListener("click", choose);
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose();
      }
    });
  });
  syncCards(false);
}

function onPin(id) {
  activeId = id || null;
  syncCards(false);
}

async function load() {
  try {
    const res = await fetch("./data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    projectsCache = data.projects || [];
    if (window.RadialGraph) RadialGraph.mount(projectsCache, { onPin });
    renderCards(projectsCache);
  } catch (err) {
    document.getElementById("cards").innerHTML =
      `<p style="color:var(--chrome-muted)">Could not load data (${escapeHtml(String(err))})</p>`;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const about = document.getElementById("about");
    const field = document.getElementById("graph-field");
    const cards = document.getElementById("cards");
    const cardsToggle = document.getElementById("cards-toggle");
    const showAbout = btn.dataset.tab === "about";
    about.classList.toggle("hidden", !showAbout);
    field.classList.toggle("hidden", showAbout);
    cards.classList.toggle("hidden", showAbout);
    cardsToggle.classList.toggle("hidden", showAbout);
  });
});

document.getElementById("cards-toggle").addEventListener("click", toggleAllCards);
document.getElementById("look-toggle").addEventListener("click", toggleLook);

applyLook(savedLook());
load();
