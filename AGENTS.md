# Agent guidelines — loom

**Owner:** Pedro.
**Repo:** [peterdays/loom](https://github.com/peterdays/loom) — a personal chronological mycelium graph of projects.

This repo does not ingest private notes. New nodes arrive as pull requests. A reviewer checks the graph and the UI do not break.

## Hard boundaries

- **No private notes in git.** Sample nodes only. Leave out secrets, credentials, and absolute filesystem paths.
- **Pages stay off.** Do not enable GitHub Pages. Do not change repository visibility.
- **One node per pull request.** Open a PR that adds a node via `scripts/add-node.py`. Leave `main` for the merge.
- **Nodes stay small.** Short title + one-line summary. No essays.
- **Dual JSON.** `data/projects.json` and `public/data/projects.json` carry the same `projects` array.

## Add one node

1. On a branch, append one project with **`scripts/add-node.py`**. **`scripts/proposal-to-node.py`** reads a filled [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md) and calls `add-node.py`.
2. The helper writes both JSON files.
3. Open a pull request. A reviewer checks the graph and the page still work:

```bash
python3 scripts/add-node.py --validate-only
python3 scripts/smoke-page.py
```

Protocol: [`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md).
Map: [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md).

## Fields

| Field | Rule |
|-------|------|
| `id` | kebab-case, unique across the array |
| `title` | short public title, **≤ ~60 characters** |
| `started` | `YYYY-MM` or `YYYY-MM-DD` |
| `ended` | `null` or the same date format as `started` |
| `parent` | existing project `id`, or `null` for a new root |
| `summary` | **one sentence**, public, **≤ ~160 characters** |
| `tags` | lowercase kebab-case strings, **≤ 5** tags |

### Tooling

Hand-edit the dual JSON only when you must. On a branch:

1. **`scripts/add-node.py`** validates and appends. `--validate-only` checks both files against **`schemas/projects.schema.json`** (stdlib, no extra packages).
2. Shape: **`schemas/projects.schema.json`**.
3. Map: **[`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md)**.
4. Filled proposal → argv or append: **`scripts/proposal-to-node.py`**.
5. CI: [`.github/workflows/validate-projects.yml`](.github/workflows/validate-projects.yml) runs `python3 scripts/add-node.py --validate-only` and `python3 scripts/smoke-page.py` on pull requests and pushes to `main`.

```bash
python3 scripts/add-node.py --dry-run \
 --id example-project --title "Example project" --started 2026-10-02 \
 --parent null \
 --summary "One public sentence." --tag process

python3 scripts/add-node.py --validate-only

python3 scripts/proposal-to-node.py path/to/proposal.md          # dry-run
python3 scripts/proposal-to-node.py path/to/proposal.md --apply  # append both JSON files
```

The scripts only edit files locally. Open a pull request for the node.

### Refuse if

- Fields are missing or invalid, `id` is already used, or `parent` does not exist (unless `null`).
- Title, summary, or tags exceed the size budget, or the summary is more than one sentence.
- Title, summary, or tags contain secrets, credentials, or absolute filesystem paths.

## Do not regress

- Default skin **Spores**. Default fork **Ribbon**. Default look is that current page. White mode is one optional toggle, saved in the browser; a first visit stays on the current look. No skin or fork picker.
- Chronological spine: time left→right, top→bottom on narrow viewports. Root nodes are larger than subnodes; hyphae taper from the parent toward the child.
- CI: `add-node.py --validate-only` and `scripts/smoke-page.py`.
- Project data lives under `data/` and `public/data/`.
