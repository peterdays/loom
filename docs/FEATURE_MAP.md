# Feature map (for bots)

One-page map of what matters when adding timeline nodes or touching the UI. Details live in the linked files — do not treat this as a novel.

| Feature | What it is | Where |
|---------|------------|--------|
| **Spine UI** | Chronological project spine + node cards | `public/index.html`, `public/app.js`, `public/styles.css` |
| **Skins** | CSS themes (default **Spores**); `localStorage` key `loom-skin` | `public/styles.css`, skin switcher in `public/app.js` |
| **Forks** | Parent→child hypha stroke styles (default **Ribbon**); key `loom-fork-style` | `public/app.js`, Forks control |
| **Node data (dual path)** | Same `projects` array in two files — keep in sync | `data/projects.json`, `public/data/projects.json` |
| **JSON Schema** | Machine-readable node + file shape | `schemas/projects.schema.json` |
| **add-node helper** | Preferred way to append **one** validated stub on a branch. `--validate-only` checks field rules and `schemas/projects.schema.json` (stdlib, no extra packages) | `scripts/add-node.py` |
| **Proposal helper** | Filled `_TEMPLATE.md` shape (markdown file or stdin YAML/labeled lines) → `add-node.py` argv or append | `scripts/proposal-to-node.py` |
| **CI** | Pull requests and pushes to `main` run `python3 scripts/add-node.py --validate-only` | `.github/workflows/validate-projects.yml` |
| **Intake protocol** | Slack `#loom` → `@loom ship it` → **PR** (not direct `main`) | `docs/NODE_PROTOCOL.md`, `AGENTS.md` |
| **Proposal shape** | Mini stub fields | `docs/proposals/_TEMPLATE.md` |
| **Agent rules** | Hard boundaries, field table, refuse criteria | `AGENTS.md` |
| **Mnemoteca sync stub** | Read-only vault → site when path set; never write vault | `scripts/sync-from-mnemoteca.sh` |
| **Push helpers** | Token HTTPS / Git Data API for private repo | `scripts/push-with-token.sh`, `scripts/push-via-git-data-api.py` |

## Append a node (preferred)

```bash
# on a feature branch — never straight to main for node content
python3 scripts/add-node.py \
  --id my-stub-id \
  --title "Short public title" \
  --started 2026-10-02 \
  --parent temporal-loom-site \
  --summary "One public-safe sentence about the stub." \
  --tag stub --tag process

python3 scripts/add-node.py --validate-only   # dual JSON + schema
python3 scripts/add-node.py --dry-run …       # print node, no write
```

## Proposal → node

`scripts/proposal-to-node.py` parses a filled proposal and **calls** `add-node.py` (it does not duplicate validation). Default is dry-run. `--apply` appends on the current branch — still open a PR.

```bash
python3 scripts/proposal-to-node.py --print-argv <<'EOF'
id: example-stub
title: Example stub
started: 2026-10-02
ended: null
parent: temporal-loom-site
summary: One public-safe sentence.
tags: [stub]
EOF

python3 scripts/proposal-to-node.py docs/proposals/some-filled-proposal.md --apply
```

`docs/proposals/loom-agent-tooling.md` is the filled proposal already applied for the tooling stub. Running it again is refused (duplicate id).

Then commit and open a PR against `main`. Real node ships still need Pedro’s `@loom ship it` in the Slack `#loom` thread.

## Do not regress

- Default skin **Spores**, default fork **Ribbon**
- Stubs only — no vault dumps, no writes into jarvas-mnemoteca
- Dual JSON must stay identical for `projects`
- GitHub issues are **not** intake
