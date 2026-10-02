# Feature map (for bots)

One-page map of what matters when adding timeline nodes or touching the UI. Details live in the linked files — do not treat this as a novel.

| Feature | What it is | Where |
|---------|------------|--------|
| **Spine UI** | Chronological project spine + node cards | `public/index.html`, `public/app.js`, `public/styles.css` |
| **Skins** | CSS themes (default **Spores**); `localStorage` key `loom-skin` | `public/styles.css`, skin switcher in `public/app.js` |
| **Forks** | Parent→child hypha stroke styles (default **Ribbon**); key `loom-fork-style` | `public/app.js`, Forks control |
| **Node data (dual path)** | Same `projects` array in two files — keep in sync | `data/projects.json`, `public/data/projects.json` |
| **JSON Schema** | Machine-readable node + file shape | `schemas/projects.schema.json` |
| **add-node helper** | Preferred way to append **one** validated stub on a branch | `scripts/add-node.py` |
| **Intake protocol** |  `` → `open a PR` → **PR** (not direct `main`) | `docs/NODE_PROTOCOL.md`, `AGENTS.md` |
| **Proposal shape** | Mini stub fields | `docs/proposals/_TEMPLATE.md` |
| **Agent rules** | Hard boundaries, field table, refuse criteria | `AGENTS.md` |
| ** sync stub** | Read-only notes → site when path set; never write notes | `` |
| **Push helpers** | Token HTTPS / Git Data API for private repo | ``, `` |

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

python3 scripts/add-node.py --validate-only   # dual JSON sanity
python3 scripts/add-node.py --dry-run …       # print node, no write
```

Then commit and open a PR against `main`. Human gate still required for real node ships (`open a PR` when Channels/ wake exists).

## Do not regress

- Default skin **Spores**, default fork **Ribbon**
- Stubs only — no notes dumps, no writes into 
- Dual JSON must stay identical for `projects`
- GitHub issues are **not** intake
