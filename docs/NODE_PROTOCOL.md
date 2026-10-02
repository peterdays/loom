# Adding a timeline node

Loom is a personal chronological mycelium graph. This repo does not ingest private notes. New nodes arrive as pull requests.

## Flow

1. **Draft** a mini stub: short title, one-line summary. Shape: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).
2. **Append on a branch** with `scripts/add-node.py`, or `scripts/proposal-to-node.py` which calls it. The helper updates both `data/projects.json` and `public/data/projects.json`.
3. **Open a pull request** that adds that one node via `add-node.py`.
4. **Review.** A reviewer checks the graph and the page still work (`python3 scripts/add-node.py --validate-only` and `python3 scripts/smoke-page.py`).

One node per pull request. Leave `main` for the merge.

## Fields

| Field | Rule |
|-------|------|
| `id` | kebab-case, unique |
| `title` | ≤ ~60 characters |
| `summary` | one sentence, ≤ ~160 characters |
| `tags` | ≤ 5 lowercase kebab-case tags |
| `started` | `YYYY-MM` or `YYYY-MM-DD` |
| `ended` | `null` or the same date format |
| `parent` | an existing project `id`, or `null` |

## Refuse

- Missing or invalid fields, duplicate `id`, or a `parent` that does not exist.
- Essays, multi-paragraph summaries, or more than five tags.
- Secrets, credentials, or absolute filesystem paths.

## Example

```yaml
id: example-stub
title: Example stub
started: 2026-10-02
ended: null
parent: temporal-loom-site
summary: One public sentence about a personal project.
tags: [stub]
```

```bash
python3 scripts/add-node.py --dry-run \
  --id example-stub --title "Example stub" --started 2026-10-02 \
  --parent temporal-loom-site \
  --summary "One public sentence about a personal project." --tag stub
```

Agent rules: [`AGENTS.md`](../AGENTS.md). Map: [`FEATURE_MAP.md`](FEATURE_MAP.md).
