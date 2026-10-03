# loom

Personal chronological **mycelium graph** of projects. Time runs along one spine; parent links fork off it as hyphae.

## Status

**Private sandbox.** This repository stays private. GitHub Pages stays off until a deliberate public cutover after content review. Local preview only:

```bash
python3 -m http.server 8080 --directory public
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` serves `public/` on a random localhost port and checks that `index.html` is 200, that linked `styles.css` and `app.js` are fetchable, that the projects JSON `app.js` fetches has a `projects` array, and that startup DOM hooks (`#graph`, `#cards`, `#cards-toggle`, `#about`, `.tab`) plus the Spores / Ribbon defaults on `<html>` are still in the HTML. The show-all control starts as "Show all node cards". It also runs `node --check public/app.js` when `node` is on `PATH`.

The site is served from `public/` via [`.github/workflows/pages.yml`](.github/workflows/pages.yml); the project URL will be https://peterdays.github.io/loom once Pages is turned on.

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

`public/` draws a **chronological spine**: projects sit on a time axis (left→right, or top→bottom on narrow viewports). `parent` forks are **mold hyphae** — organic strokes that leave the straight TIME spine. Meander geometry is seeded from the child project id (FNV-1a → mulberry32). Nested sibling lanes stay quieter. Node cards stay hidden on load. Click a node to show its card; click that same node again to hide it. **Show all node cards** reveals every card; the same control hides them again. Project data lives in `data/projects.json` and `public/data/projects.json`.

The page has one look. Skin **Spores** (deep blue + lime capillary hyphae, hyphal-tip nodes) and fork style **Ribbon** (soft tapered stroke, gentle S-curves). There is no skin or fork switcher.

## Layout

```
AGENTS.md
docs/NODE_PROTOCOL.md
docs/FEATURE_MAP.md
docs/proposals/_TEMPLATE.md
schemas/projects.schema.json
.github/workflows/validate-projects.yml
.github/workflows/pages.yml
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
