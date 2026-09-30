---
name: New timeline node
about: Optional durable ticket for a loom timeline stub. Primary ship gate is  open a PR in .
title: "timeline-node: "
labels: timeline-node
---

## Note

** `` + `open a PR` is the primary go signal.** This issue is an optional durable / alternate path for tracking. Do not treat issue creation alone as permission to merge a node.

Stubs only. No notes dumps. No secrets. Never write into .

## Proposed node

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One or two public-safe sentences. No notes paths or quotes.
tags:
  - lowercase
  - tags
```

## Checklist

- [ ] Public-safe; Pedro (or clear human) has reviewed / redacted
- [ ] `parent` exists or is `null`
- [ ] No secrets / notes dumps
- [ ]  thread linked (if any):
- [ ] Ship only after `open a PR` in `` (or explicit human go there)

## References

- Protocol: `docs/NODE_PROTOCOL.md`
- Template: `docs/proposals/_TEMPLATE.md`
- Agent rules: `AGENTS.md`
