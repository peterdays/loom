# loom

Personal **temporal loom** — a cyberpunk branching timeline of AI projects, with room for later tabs (e.g. a presentation page).

Fed **read-only** from **** (Pedro’s personal personal notes). A personal project graph.

## Status

**Private build sandbox.** Do not assume a public site.

GitHub Pages on a free account only works for **public** repos (private Pages is paid). Pages should go live only when this repo is **deliberately made public** and the content is reviewed for what may appear on the open web. Until then: local static preview only.

```bash
python3 -m http.server 8080 --directory public
```

## Node intake (human-gated)

Timeline **node content** is never auto-published. Primary path: author drafts a public-safe stub →  `` → Pedro reviews/redacts → **`open a PR`** → loom validates, appends to both `data/projects.json` and `public/data/projects.json`, commits, pushes.

- Full protocol: [`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md)
- Agent rules: [`AGENTS.md`](AGENTS.md)
- Proposal template: [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md)
- Optional GitHub ticket: [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](.github/ISSUE_TEMPLATE/new-timeline-node.md) (durable/alternate;  remains the primary gate)

Stubs only. Never notes dumps. Never write into .

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
AGENTS.md
docs/NODE_PROTOCOL.md
docs/proposals/_TEMPLATE.md
.github/ISSUE_TEMPLATE/new-timeline-node.md
data/projects.json
public/index.html|styles.css|app.js|data/projects.json

README.md
```

## Agent autonomy

The `loom` Grok Bot owns iteration on UI + sync (commit/push to this private repo without per-step approval). **Node content** always requires the human gate in [`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md). Sensitive notes content stays out of git.
