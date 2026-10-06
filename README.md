# loom

Personal chronological **mycelium graph** of projects. Root projects are large hubs; thinner hyphae radiate out to smaller nodes.

## Status

**Private sandbox.** This repository stays private. GitHub Pages stays off until a deliberate public cutover after content review. Local preview only:

```bash
python3 -m http.server 8080 --directory public
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` serves `public/` on a random localhost port and checks that `index.html` is 200, that linked `styles.css` and `app.js` are fetchable, that the projects JSON `app.js` fetches has a `projects` array, and that startup DOM hooks (`#graph`, `#cards`, `#cards-toggle`, `#look-toggle`, `#about`, `.tab`) plus the Spores / Ribbon / current-look defaults on `<html>` are still in the HTML. The show-all control starts as "Show all node cards". The White mode switch starts off. It also runs `node --check public/app.js` when `node` is on `PATH`.

The site is served from `public/` via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) at https://peterdays.github.io/loom/.

The bare user root `https://peterdays.github.io/` is a different Pages site. GitHub only serves that URL from a repository named `peterdays.github.io`, which this project repo cannot replace. [`docs/user-site/index.html`](docs/user-site/index.html) is the redirect page for that repository (meta refresh, `location.replace`, and a canonical link to `/loom/`). Unknown paths under `/loom/` use [`public/404.html`](public/404.html), which sends visitors to the project home.

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

`public/` draws a **radial mycelium**. Projects with `parent: null` are large glowing hubs. Child nodes are smaller, and organic hyphae radiate outward from each hub (a gentle Ribbon S-curve, seeded from the child id). When there is more than one hub, earlier hubs sit to the left of later ones (top to bottom on a narrow screen). Each node carries its start date. Node cards stay hidden on load. Click a node to show its card; click that same node again to hide it. **Show all node cards** reveals every card; the same control hides them again. Project data lives in `data/projects.json` and `public/data/projects.json`.

The page loads in skin **Spores** (deep blue + lime capillary hyphae, hyphal-tip nodes) and fork style **Ribbon** (soft tapered stroke, gentle S-curves). A **White mode** control switches to a white ground with readable text and the same strokes, layout, and behavior. The choice is saved in the browser; a first visit stays on Spores. There is no skin or fork picker.

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
