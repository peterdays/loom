# loom

Personal **temporal loom** — a cyberpunk branching timeline of AI projects, with room for later tabs (e.g. a presentation page).

Fed **read-only** from **** (Pedro’s personal personal notes). A personal project graph.

## Status

**Private build sandbox.** Do not assume a public site.

GitHub Pages on a free account only works for **public** repos (private Pages is paid). Pages should go live only when this repo is **deliberately made public** and the content is reviewed for what may appear on the open web. Until then: local static preview only.

```bash
python3 -m http.server 8080 --directory public
```

## Temporal graph

`public/` draws a **chronological spine**: projects sit on a time axis (left→right, or top→bottom on narrow viewports). On the default skin, `parent` forks are **mold paths** — organic hypha-like curves, not orthogonal stubs. The meander is seeded from the child project id (FNV-1a → mulberry32), so a reload draws the same curves. Nested sibling lanes use a smaller amplitude. The spine itself stays straight. Click a node to focus its card. Stub data only in `public/data/projects.json`.

A **skin switcher** on the page offers ≥4 distinct looks (CSS themes + edge layout variants):

| Skin | Look | Edges / nodes |
|------|------|----------------|
| **Neon** | Soft cyan/magenta glow | curved / circles |
| **Circuit** | CRT grid, monospace, hard angles | orthogonal / squares |
| **Blueprint** | White-on-blue print, dashed lines, REV stamps | orthogonal / circles |
| **Obsidian** | Near-black phosphor amber/green, blocky | orthogonal / squares |
| **Ink** | Cream paper / editorial (baseline) | curved / diamonds |
| **Ink Ortho** | Same cream/red ink palette, hard angles | orthogonal / squares |
| **Ink Schematic** (default) | Thin technical strokes, stamp labels, paper grid | mold hyphae (seeded) / squares |
| **Ink Brutal** | High-contrast black on cream, thick angles | orthogonal / squares |
| **Ink Sepia** | Warm sepia paper, hard edges | orthogonal / diamonds |

Choice persists in `localStorage` (`loom-skin`).

##  → loom pipeline

1. Stub JSON ships with non-sensitive sample projects.
2. Sync (when a notes checkout exists):

   ```bash
   export =/path/to/
   
   ```

   notes → site only. **Never** write into  from this repo.
3. Review `data/projects.json` before any future public Pages cutover — no private personal notes dumps on the public web.

## Layout

```
data/projects.json
public/index.html|styles.css|app.js|data/projects.json

README.md
```

## Agent autonomy

The `loom` Grok Bot owns iteration on UI + sync (commit/push to this private repo without per-step approval). Sensitive notes content stays out of git.
