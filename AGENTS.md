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

1. On a branch, append one project with **`scripts/add-node.py`**. Add an optional secondary relationship with `--connect-to existing-id` (repeat it for up to five links). **`scripts/proposal-to-node.py`** reads a filled [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md) and calls `add-node.py`.
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
| `connections` | optional, up to 5 existing project ids for secondary non-lineage links |
| `summary` | **one sentence**, public, **≤ ~160 characters** |
| `tags` | lowercase kebab-case strings, **≤ 5** tags |

`parent` establishes the primary project lineage and layout. Use `connections` only for an intentional secondary relationship to an existing node; it does not make the target a parent or child. Each connection must name a distinct existing id and cannot name the node being added.

### Copy style

- Do not talk about Pedro in the third person in node copy.
- State what the project or node is; avoid vague positioning against generic alternatives.
- Keep copy concrete and first-person/owner-neutral where possible.
- Keep public-safety limits: no hostnames, IPs, usernames, repo paths, credentials, or access instructions.

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

# Optional: add one or more secondary links while appending the node.
python3 scripts/add-node.py --dry-run \
 --id linked-project --title "Linked project" --started 2026-10-02 \
 --parent null --connect-to existing-project-id \
 --summary "One public sentence." --tag process

python3 scripts/add-node.py --validate-only

python3 scripts/proposal-to-node.py path/to/proposal.md          # dry-run
python3 scripts/proposal-to-node.py path/to/proposal.md --apply  # append both JSON files
```

The scripts only edit files locally. Open a pull request for the node.

### Refuse if

- Fields are missing or invalid, `id` is already used, `parent` does not exist (unless `null`), or a `connections` target is missing, duplicated, or self-referential.
- Title, summary, or tags exceed the size budget, or the summary is more than one sentence.
- Title, summary, or tags contain secrets, credentials, or absolute filesystem paths.

## Do not regress

- Default skin **Spores**. Default fork **Ribbon**. Default look is that current page. White mode is one optional toggle, saved in the browser; a first visit stays on the current look. No skin or fork picker.
- Chronological spine: time left→right, top→bottom on narrow viewports. Root nodes are larger than subnodes; hyphae taper from the parent toward the child.
- CI: `add-node.py --validate-only` and `scripts/smoke-page.py`.
- Project data lives under `data/` and `public/data/`.

## Ship gate (UI proof)

**Rule (Pedro, 2026-10-06).** A pull request that changes the page needs a human-visible proof walk before merge. A pull request that does not change the page is not blocked by that walk.

**Needs UI proof (do not merge until PASS):** changes to page HTML, CSS, or JS, skins, layout, `scripts/smoke-page.py` expectations, or anything that affects how the graph page looks or loads in a browser. Proof is `python3 scripts/smoke-page.py` green plus a short visual check (desktop and a narrow viewport) by LoomBot or Pedro. Attach or link shots when the change is visual.

**Skip UI proof (merge when CI green):** one-node data pull requests that only touch `data/projects.json` and `public/data/projects.json` via `add-node.py`, docs-only, schema-only with no page change, and chores that cannot affect the rendered page. The pull request body must say `Ship gate: skip (reason: …)`. No walk and no screenshots on that pull request.

**Never:** require a full voluqaui-style walk for a simple node-add pull request.
