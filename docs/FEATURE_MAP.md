# Feature map

One-page map for adding a timeline node or touching the UI.

| Feature | What it is | Where |
|---------|------------|--------|
| **Spine UI** | Chronological project spine. Node cards stay hidden until a node is chosen, or until **Show all node cards** | `public/index.html`, `public/app.js`, `public/styles.css` |
| **Look** | Default skin **Spores**, fork **Ribbon**, `data-look="current"`. One **White mode** toggle persists in the browser; a first visit stays on the current look. No skin or fork picker | `public/index.html`, `public/styles.css`, `public/app.js` |
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
  --id my-project-id \
  --title "Short public title" \
  --started 2026-10-02 \
  --parent null \
  --summary "One public sentence about the project." \
  --tag process

python3 scripts/add-node.py --validate-only
python3 scripts/add-node.py --dry-run …
python3 scripts/smoke-page.py
```

`scripts/smoke-page.py` is stdlib only. It serves `public/`, then checks `index.html` (200), linked `styles.css` and `app.js`, the fetched `projects` array, and the startup DOM hooks in `index.html` (`#graph`, `#cards`, `#cards-toggle`, `#look-toggle`, `#about`, `.tab`, default skin **Spores** / fork **Ribbon** / look **current** on `<html>`). The show-all control starts labeled **Show all node cards**, the White mode switch starts off, and `index.html` does not include a node card. `node --check public/app.js` runs when `node` is on `PATH`. The same checks are the `page-smoke` job in CI.

## Proposal → node

`scripts/proposal-to-node.py` parses a filled proposal and **calls** `add-node.py`. Default is dry-run. `--apply` appends on the current branch. Open a pull request afterward.

```bash
python3 scripts/proposal-to-node.py --print-argv <<'EOF'
id: example-project
title: Example project
started: 2026-10-02
ended: null
parent: null
summary: One public sentence.
tags: [process]
EOF

python3 scripts/proposal-to-node.py docs/proposals/some-filled-proposal.md --apply
```

Then open a pull request against `main`. A reviewer checks the graph and the page still work.

## Do not regress

- Default skin **Spores**, default fork **Ribbon**, default look **current** (White mode is one optional toggle)
- Chronological spine
- Dual JSON `projects` arrays stay identical
- Public nodes only — this repo does not ingest private notes
