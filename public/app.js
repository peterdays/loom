async function load() {
  const root = document.getElementById("timeline");
  try {
    const res = await fetch("./data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const projects = [...(data.projects || [])].sort((a, b) =>
      String(b.started || "").localeCompare(String(a.started || ""))
    );
    if (!projects.length) {
      root.innerHTML = "<p class='loading'>No projects yet. Sync from Mnemoteca.</p>";
      return;
    }
    root.innerHTML = projects.map((p) => {
      const when = p.ended ? `${p.started || "?"} → ${p.ended}` : (p.started || "ongoing");
      const tags = (p.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
      return `<article class="item">
        <div class="when">${escapeHtml(when)}</div>
        <div class="card">
          <h2>${escapeHtml(p.title || "Untitled")}</h2>
          <p>${escapeHtml(p.summary || "")}</p>
          <div class="tags">${tags}</div>
        </div>
      </article>`;
    }).join("");
  } catch (err) {
    root.innerHTML = `<p class="loading">Could not load data/projects.json (${escapeHtml(String(err))})</p>`;
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
load();
