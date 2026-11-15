# Agent guidelines — loom

**Owner:** Pedro.
**Repo:** [peterdays/loom](https://github.com/peterdays/loom) — a personal radial graph of projects. Colour is time.

This repo does not ingest private notes. New nodes arrive as pull requests. A reviewer checks the graph and the UI do not break.

## Hard boundaries

- **No private notes in git.** Sample nodes only. Leave out secrets, credentials, and absolute filesystem paths.
- **Pages stay off.** Do not enable GitHub Pages. Do not change repository visibility.
- **One node per pull request.** Open a PR that adds a node via `scripts/add-node.py`. Leave `main` for the merge.
- **Summary budget.** Short title (≤ ~60 characters). A summary is public and at most 1513 characters, and may include paragraphs and short bullet lines.
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
| `ongoing` | optional boolean. `true` means the work is still being made: its span runs to today and it glows into the core. Omit it for ended work. Do not infer it from how recent `started` is |
| `parent` | existing project `id`, or `null` for a new root |
| `connections` | optional, up to 5 existing project ids for secondary non-lineage links |
| `summary` | public, **≤ 1513 characters**; paragraphs and short bullet lines allowed |
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
- Title, summary, or tags exceed the size budget.
- Title, summary, or tags contain secrets, credentials, or absolute filesystem paths.

## Do not regress

- Default skin **Spores** and fork **Ribbon** stay declared on `<html>` (`data-skin`, `data-fork-style`). No skin or fork picker. They do not draw a second graph.
- The homepage graph is the radial field in `public/graph.js`. Colour is one ramp (violet at the edge, white-gold at now). Older work sits further out. Each root draws a lifespan ring. Links are solid strands. A span runs from `started` to the start of the newest descendant; a project with no descendants is a single burst. `ongoing: true` runs the span to today and glows into the core. `prefers-reduced-motion` skips the entry and the shimmer. `?still` freezes motion for screenshots.
- White mode is one optional toggle, saved in the browser; a first visit stays on the current look. The radial graph stays on its dark field in either look, because the colour ramp is drawn for that ground. White mode lightens the nav, the node cards, and the about panel.
- Node cards stay hidden until a node is chosen, or until **Show all node cards**. Summaries keep paragraphs (`white-space: pre-line`) and public links.
- CI: `add-node.py --validate-only` and `scripts/smoke-page.py`.
- Project data lives under `data/` and `public/data/`.

## Ship gate (UI proof)

**Rule (Pedro, 2026-10-06).** A pull request that changes the page needs a human-visible proof walk before merge. A pull request that does not change the page is not blocked by that walk.

**Needs UI proof (do not merge until PASS):** changes to page HTML, CSS, or JS, skins, layout, `scripts/smoke-page.py` expectations, or anything that affects how the graph page looks or loads in a browser. Proof is `python3 scripts/smoke-page.py` green plus a short visual check (desktop and a narrow viewport) by LoomBot or Pedro. Attach or link shots when the change is visual.

**Skip UI proof (merge when CI green):** one-node data pull requests that only touch `data/projects.json` and `public/data/projects.json` via `add-node.py`, docs-only, schema-only with no page change, and chores that cannot affect the rendered page. The pull request body must say `Ship gate: skip (reason: …)`. No walk and no screenshots on that pull request.

**Never:** require a full voluqaui-style walk for a simple node-add pull request.
