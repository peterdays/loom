# Timeline node proposal

Short title + one-line summary. One node per pull request.

## Size budget

- `title` ≤ ~60 characters
- `summary` ≤ ~160 characters (one sentence)
- `tags` ≤ 5 lowercase kebab-case tags

## Shape

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One public sentence.
tags: [lowercase, tags]
```

Labeled lines also work:

```
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One public sentence.
tags: lowercase, tags
```

## Checklist

- [ ] Mini proposal — one sentence, within the size budget
- [ ] `id` is kebab-case and absent from `data/projects.json`
- [ ] `started` / `ended` use `YYYY-MM` or `YYYY-MM-DD` (`ended` may be `null`)
- [ ] `parent` is an existing project `id`, or `null` for a new root
- [ ] No secrets, credentials, or absolute filesystem paths

## Open the pull request

On a branch, `scripts/proposal-to-node.py` (or `scripts/add-node.py`) appends one object to both `data/projects.json` and `public/data/projects.json`. Open a pull request. A reviewer checks the graph and the page still work. See [`docs/NODE_PROTOCOL.md`](../NODE_PROTOCOL.md) and [`AGENTS.md`](../../AGENTS.md).
