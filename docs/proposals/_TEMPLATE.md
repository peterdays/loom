# Timeline node proposal (stub)

Public-safe summary only. Stubs/samples for git — **never** vault dumps, secrets, or private notes.

Copy the block below, fill it, post to Slack `#loom`, wait for Pedro to review, then ship only on `@loom ship it`.

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One or two sentences that are safe if this private repo ever goes public. No vault paths or quotes.
tags:
  - lowercase
  - tags
```

## Knowledge-agent checklist

- [ ] `id` is kebab-case and not already in `data/projects.json`
- [ ] `started` / `ended` use `YYYY-MM` or `YYYY-MM-DD` (`ended` may be `null`)
- [ ] `parent` is an **existing** project `id`, or `null` for a new root
- [ ] `summary` is 1–2 sentences, public-safe
- [ ] No secrets, credentials, client-confidential detail, or unannounced/top-secret projects
- [ ] No real vault quotes or absolute Mnemoteca / filesystem paths
- [ ] Tags are lowercase
- [ ] Posted to Slack `#loom` for Pedro review (primary gate)
- [ ] Optional: open GitHub issue with template `new-timeline-node` for tracking — not required to ship

## After Pedro says `@loom ship it`

loom appends one object to both `data/projects.json` and `public/data/projects.json`, commits, pushes, confirms in-thread. See [`docs/NODE_PROTOCOL.md`](../NODE_PROTOCOL.md) and [`AGENTS.md`](../../AGENTS.md).
