# Feature map

One-page map for adding a timeline node or touching the UI.

| Feature | What it is | Where |
|---------|------------|--------|
| **Spine UI** | Chronological project spine + node cards | `public/index.html`, `public/app.js`, `public/styles.css` |
| **Skins** | CSS themes (default **Spores**); `localStorage` key `loom-skin` | `public/styles.css`, skin switcher in `public/app.js` |
| **Forks** | Parent→child hypha stroke styles (default **Ribbon**); key `loom-fork-style` | `public/app.js`, Forks control |
| **Node data (dual path)** | Same `projects` array in two files — keep in sync | `data/projects.json`, `public/data/projects.json` |
| **JSON Schema** | Machine-readable node + file shape | `schemas/projects.schema.json` |
| **add-node helper** | Append **one** validated stub on a branch. `--validate-only` checks field rules and the schema (stdlib) | `scripts/add-node.py` |
| **Proposal helper** | Filled `_TEMPLATE.md` shape (markdown file or stdin YAML/labeled lines) → `add-node.py` | `scripts/proposal-to-node.py` |
| **CI** | Pull requests and pushes to `main`: `add-node.py --validate-only` and a page smoke | `.github/workflows/validate-projects.yml`, `scripts/smoke-page.py` |
| **Node protocol** | Open a PR that adds a node via `add-node.py`. A reviewer checks the graph and the page | `docs/NODE_PROTOCOL.md`, `AGENTS.md` |
| **Proposal shape** | Mini stub fields | `docs/proposals/_TEMPLATE.md` |
| **Agent rules** | Boundaries, field table, refuse criteria | `AGENTS.md` |

## Append a node

```bash
# on a feature branch — open a pull request for the node
python3 scripts/add-node.py \
  --id my-stub-id \
  --title "Short public title" \
  --started 2026-10-02 \
  --parent temporal-loom-site \
  --summary "One public sentence about the stub." \
  --tag stub --tag process

python3 scripts/add-node.py --validate-only
python3 scripts/add-node.py --dry-run …
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` is stdlib only. It serves `public/`, then checks `index.html` (200), linked `styles.css` and `app.js`, the fetched `projects` array, and the startup DOM hooks in `index.html` (`#graph`, `#cards`, `#about`, `.tab`, `.skin-btn`, `.fork-btn`, default skin **Spores** / fork **Ribbon**). `node --check public/app.js` runs when `node` is on `PATH`. The same checks are the `page-smoke` job in CI.

## Proposal → node

`scripts/proposal-to-node.py` parses a filled proposal and **calls** `add-node.py`. Default is dry-run. `--apply` appends on the current branch. Open a pull request afterward.

```bash
python3 scripts/proposal-to-node.py --print-argv <<'EOF'
id: example-stub
title: Example stub
started: 2026-10-02
ended: null
parent: temporal-loom-site
summary: One public sentence.
tags: [stub]
EOF

python3 scripts/proposal-to-node.py docs/proposals/some-filled-proposal.md --apply
```

`docs/proposals/loom-agent-tooling.md` is the filled proposal already applied for the tooling stub. Running it again is refused (duplicate id).

Then open a pull request against `main`. A reviewer checks the graph and the page still work.

## Do not regress

- Default skin **Spores**, default fork **Ribbon**
- Chronological spine
- Dual JSON `projects` arrays stay identical
- Sample nodes only — this repo does not ingest private notes
