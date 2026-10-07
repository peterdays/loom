# loom

Personal chronological **mycelium graph** of projects. Time runs along one spine; parent links fork off it as hyphae that taper toward the child. Root nodes are larger than subnodes.

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

`public/` draws a **chronological spine**: projects sit on a time axis (left→right, or top→bottom on narrow viewports). Projects with `parent: null` are larger nodes. `parent` forks are **mold hyphae** — quiet Ribbon curves that leave the TIME spine and taper from thick at the parent to thin at the child. Optional `connections` render as thinner dotted secondary links between existing nodes, without altering the primary lineage. Meander geometry is seeded from the child project id (FNV-1a → mulberry32). Nested sibling lanes stay quieter. Node cards stay hidden on load. Click a node to show its card; click that same node again to hide it. **Show all node cards** reveals every card; the same control hides them again. Project data lives in `data/projects.json` and `public/data/projects.json`.

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
