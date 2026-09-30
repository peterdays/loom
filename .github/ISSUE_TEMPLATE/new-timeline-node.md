---
name: New timeline node
about: Optional durable ticket for a loom timeline stub. Primary ship gate is  open a PR in  (in-message mini proposal; thread iterates).
title: "timeline-node: "
labels: timeline-node
---

## Note

** `` + `open a PR` is the primary go signal.** Prefer a **plain  message** mini proposal (fenced YAML/JSON or labeled lines); `.md` attachment optional. The  **thread is for iterating**; only `open a PR` freezes the latest human-approved fields (edits in the ship message win).

This issue is an optional durable / alternate path for tracking. Do not treat issue creation alone as permission to merge a node.

Stubs only — **keep them small**. No notes dumps. No secrets. Never write into .

## Size budget

- `title` ≤ ~60 characters
- `summary` ≤ ~160 characters (one sentence)
- `tags` ≤ 5 lowercase tags

## Proposed node

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One public-safe sentence. No notes paths or quotes.
tags: [lowercase, tags]
```

## Checklist

- [ ] Mini stub within size budget (not an essay)
- [ ] Public-safe; Pedro (or clear human) has reviewed / redacted
- [ ] `parent` exists or is `null`
- [ ] No secrets / notes dumps
- [ ]  thread linked (if any):
- [ ] Ship only after `open a PR` in `` (or explicit human go there); ship-message field edits win

## References

- Protocol: `docs/NODE_PROTOCOL.md`
- Template: `docs/proposals/_TEMPLATE.md`
- Agent rules: `AGENTS.md`
