# Adding a timeline node

Loom is a personal radial graph of projects. This repo does not ingest private notes. New nodes arrive as pull requests.

## Flow

1. **Draft** a mini stub: short title and a public summary (≤ 1513 characters; paragraphs and short bullet lines allowed). Shape: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).
2. **Append on a branch** with `scripts/add-node.py`, or `scripts/proposal-to-node.py` which calls it. The helper updates both `data/projects.json` and `public/data/projects.json`.
3. **Open a pull request** that adds that one node via `add-node.py`.
4. **Review.** A reviewer checks the graph and the page still work (`python3 scripts/add-node.py --validate-only` and `python3 scripts/smoke-page.py`).

One node per pull request. Leave `main` for the merge.

## Fields

| Field | Rule |
|-------|------|
| `id` | kebab-case, unique |
| `title` | ≤ ~60 characters |
| `summary` | public text, ≤ 1513 characters; paragraphs and short bullet lines allowed |
| `tags` | ≤ 5 lowercase kebab-case tags |
| `started` | `YYYY-MM` or `YYYY-MM-DD` |
| `ended` | `null` or the same date format |
| `ongoing` | optional. `true`, or omit. `true` means the span runs to today. Pass `--ongoing` to `add-node.py`. Do not infer it from the start date |
| `parent` | an existing project `id`, or `null` |
| `connections` | optional list of up to five existing project ids for ad hoc links |

`parent` is the one primary lineage link: it determines whether the node is a root or a subnode. `connections` are optional secondary associations, rendered separately and never used to change hierarchy. Every connection must be a distinct existing id other than the node’s own id.

## Refuse

- Missing or invalid fields, duplicate `id`, or a `parent` that does not exist.
- A summary over 1513 characters, or more than five tags.
- Secrets, credentials, or absolute filesystem paths.

## Example

```yaml
id: example-project
title: Example project
started: 2026-10-02
ended: null
parent: null
summary: One public sentence about a personal project.
tags: [process]
connections: [existing-project-id] # optional
```

For a copy-and-fill JSON equivalent, start from [`proposals/node-template.json`](proposals/node-template.json):

```bash
cp docs/proposals/node-template.json docs/proposals/my-project.json
python3 scripts/proposal-to-node.py docs/proposals/my-project.json
python3 scripts/proposal-to-node.py docs/proposals/my-project.json --apply
```

```bash
python3 scripts/add-node.py --dry-run \
  --id example-project --title "Example project" --started 2026-10-02 \
  --parent null \
  --summary "One public sentence about a personal project." --tag process

# Add a root or subnode plus a non-parentage link to an existing node.
python3 scripts/add-node.py \
  --id linked-project --title "Linked project" --started 2026-10-02 \
  --parent null --connect-to existing-project-id \
  --summary "One public sentence about a linked project." --tag process
```

Repeat `--connect-to existing-project-id` to add up to five secondary associations. Omit it entirely when the project only needs its normal parent/root relationship.

Agent rules: [`AGENTS.md`](../AGENTS.md). Map: [`FEATURE_MAP.md`](FEATURE_MAP.md).
