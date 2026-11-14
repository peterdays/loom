# loom

Personal **radial graph** of projects. Colour is time: violet at the edge for the oldest work, white-gold at the bright core of now. Rings mark how long each body of work lived.

## Status

Use a local preview while developing:

```bash
python3 -m http.server 8080 --directory public
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` serves `public/` on a random localhost port and checks that `index.html` is 200, that linked `styles.css` and `app.js` are fetchable, that the projects JSON `app.js` fetches has a `projects` array, and that startup DOM hooks (`#graph`, `#cards`, `#cards-toggle`, `#look-toggle`, `#about`, `.tab`) plus the Spores / Ribbon / current-look defaults on `<html>` are still in the HTML. The show-all control starts as "Show all node cards". The White mode switch starts off. It also runs `node --check public/app.js` when `node` is on `PATH`.

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

### Fast JSON path

Copy [`docs/proposals/node-template.json`](docs/proposals/node-template.json), fill in the required fields and optional `connections`, then validate before applying it on your branch. `parent` establishes lineage; `connections` are optional secondary links to existing projects and do not change hierarchy:

```bash
cp docs/proposals/node-template.json docs/proposals/my-project.json
# Edit docs/proposals/my-project.json — use null for a root parent.
python3 scripts/proposal-to-node.py docs/proposals/my-project.json
python3 scripts/proposal-to-node.py docs/proposals/my-project.json --apply
python3 scripts/add-node.py --validate-only
```

`--apply` updates both `data/projects.json` and `public/data/projects.json`. Commit only that one node and open a pull request.

For the direct helper path, add secondary links by repeating `--connect-to` (up to five):

```bash
python3 scripts/add-node.py \
  --id linked-project --title "Short public title" --started 2026-10-02 \
  --parent null --connect-to existing-project-id \
  --summary "One public sentence about the project." --tag process
```

## Temporal graph

`public/graph.js` draws a **radial graph** (no dependencies, no CDN). Older work sits further from the centre. One colour ramp runs from violet to white-gold. Each root project draws a ring for its lifespan: from `started` to the start of its newest descendant, or a single burst when it has none. Optional `connections` are solid strands and do not change lineage. A project with `"ongoing": true` runs to today and glows into the core; every other project is ended. The same data gives the same layout. Hover or tap a project to open its detail (a bottom sheet on a phone). **All / Ongoing / Ended** filters the field. `prefers-reduced-motion` skips the entry and the shimmer.

Node cards stay hidden on load. Choosing a project reveals its card; **Show all node cards** reveals every card. Summaries keep paragraphs and public links. Project data lives in `data/projects.json` and `public/data/projects.json` — the page fetches `public/data/projects.json` and does not ship a second copy in JavaScript.

`<html>` still declares skin **Spores** and fork **Ribbon**. There is no skin or fork picker, and those tokens do not draw another graph. A **White mode** control lightens the nav, the node cards, and the about panel. The radial field stays on its dark ground in either look, because the colour ramp is drawn for that ground. The choice is saved in the browser; a first visit stays on the dark page.

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
public/index.html|styles.css|app.js|graph.js|fonts/|data/projects.json
scripts/add-node.py
scripts/proposal-to-node.py
scripts/smoke-page.py
README.md
```

## For agents

Follow [`AGENTS.md`](AGENTS.md). Open a pull request that adds a node via `scripts/add-node.py`. A reviewer checks the graph and the page still work.
