# loom

Personal chronological **mycelium graph** of projects. Time runs along one spine; parent links fork off it as hyphae.

## Status

**Private sandbox.** This repository stays private. GitHub Pages stays off until a deliberate public cutover after content review. Local preview only:

```bash
python3 -m http.server 8080 --directory public
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` serves `public/` on a random localhost port and checks that `index.html` is 200, that linked `styles.css` and `app.js` are fetchable, that the projects JSON `app.js` fetches has a `projects` array, and that startup DOM hooks (`#graph`, `#cards`, `#about`, `.tab`, `.skin-btn`, `.fork-btn`) plus the Spores / Ribbon defaults are still in the HTML. It also runs `node --check public/app.js` when `node` is on `PATH`.

## Add a project node

This repo does not ingest private notes. New nodes arrive as pull requests.

1. On a branch, add **one** node with [`scripts/add-node.py`](scripts/add-node.py) (or [`scripts/proposal-to-node.py`](scripts/proposal-to-node.py), which calls it).
2. That keeps `data/projects.json` and `public/data/projects.json` in sync.
3. Open a pull request. A reviewer checks the graph and the page still work.

- Protocol: [`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md)
- Agent rules: [`AGENTS.md`](AGENTS.md)
- Feature map: [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md)
- Schema + helpers: [`schemas/projects.schema.json`](schemas/projects.schema.json), [`scripts/add-node.py`](scripts/add-node.py), [`scripts/proposal-to-node.py`](scripts/proposal-to-node.py)
- Proposal shape: [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md)
- CI: [`.github/workflows/validate-projects.yml`](.github/workflows/validate-projects.yml) on pull requests and pushes to `main` — `python3 scripts/add-node.py --validate-only` and `python3 scripts/smoke-page.py`

## Temporal graph

`public/` draws a **chronological spine**: projects sit on a time axis (left→right, or top→bottom on narrow viewports). On **Spores** (default), **Ink Schematic**, **Neon**, **Ink**, and the other **bio / mycelium** skins, `parent` forks are **mold hyphae** — organic strokes that leave the straight TIME spine. Meander geometry is seeded from the child project id (FNV-1a → mulberry32). Nested sibling lanes stay quieter. Click a node to focus its card. Stub data only in `public/data/projects.json`. Grain overlay is unchanged.

A **Forks** control (separate from skins) picks the stroke variation; default is **Ribbon** so load is not dense mycelium:

| Fork style | Look |
|------------|------|
| **Calm** | Single smooth organic hypha, light meander, optional thin sheath — no whiskers/loops |
| **Ribbon** (default) | Soft tapered stroke only, gentle S-curves, very restrained |
| **Ink etched** | Thin single stroke with slight paper-pen jitter, no layers |
| **Sparse** | At most 1–2 tiny whiskers, no anastomosing loops, lighter than the old dense pass |

Fork choice persists in `localStorage` (`loom-fork-style`), independent of skin.

A **skin switcher** on the page offers ≥4 distinct looks (CSS themes + edge layout variants):

| Skin | Look | Edges / nodes |
|------|------|----------------|
| **Neon** | Soft cyan/magenta glow | mold hyphae / circles |
| **Circuit** | CRT grid, monospace, hard angles | orthogonal / squares |
| **Blueprint** | White-on-blue print, dashed lines, REV stamps | orthogonal / circles |
| **Obsidian** | Near-black phosphor amber/green, blocky | orthogonal / squares |
| **Ink** | Cream paper / editorial (baseline) | mold hyphae / diamonds |
| **Ink Ortho** | Same cream/red ink palette, hard angles | orthogonal / squares |
| **Ink Schematic** | Thin technical strokes, stamp labels, paper grid | mold forks (style via Forks) / squares |
| **Ink Brutal** | High-contrast black on cream, thick angles | orthogonal / squares |
| **Ink Sepia** | Warm sepia paper, hard edges | orthogonal / diamonds |
| **Mycelium Night** | Black/navy substrate, teal–green glow | mold hyphae / soft glow-dots |
| **Agar Plate** | Pale culture dish, brown/olive | mold hyphae / irregular nodules |
| **Fluorescence** | Dark + magenta filaments, orange junctions | mold hyphae / soft glow-dots |
| **Spores** (default) | Deep blue + lime capillary hyphae | mold hyphae / hyphal tips |

Default skin is **Spores** (with fork style **Ribbon**). **Ink Schematic** and the other skins remain available. Organic nodes (glow-dots, nodules, hyphal tips) replace hard white squares on bio skins; TIME spine stays readable; fork styles still apply on mold paths.

Skin choice persists in `localStorage` (`loom-skin`).

## Layout

```
AGENTS.md
docs/NODE_PROTOCOL.md
docs/FEATURE_MAP.md
docs/proposals/_TEMPLATE.md
schemas/projects.schema.json
.github/workflows/validate-projects.yml
.github/ISSUE_TEMPLATE/new-timeline-node.md
data/projects.json
public/index.html|styles.css|app.js|data/projects.json
scripts/add-node.py
scripts/proposal-to-node.py
scripts/smoke-page.py
README.md
```

## For agents

Follow [`AGENTS.md`](AGENTS.md). Open a pull request that adds a node via `scripts/add-node.py`. A reviewer checks the graph and the page still work.
