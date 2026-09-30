---
name: New timeline node
about: Optional durable ticket for a loom timeline stub. Primary ship gate is Slack @loom ship it in #loom.
title: "timeline-node: "
labels: timeline-node
---

## Note

**Slack `#loom` + `@loom ship it` is the primary go signal.** This issue is an optional durable / alternate path for tracking. Do not treat issue creation alone as permission to merge a node.

Stubs only. No vault dumps. No secrets. Never write into jarvas-mnemoteca.

## Proposed node

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One or two public-safe sentences. No vault paths or quotes.
tags:
  - lowercase
  - tags
```

## Checklist

- [ ] Public-safe; Pedro (or clear human) has reviewed / redacted
- [ ] `parent` exists or is `null`
- [ ] No secrets / vault dumps
- [ ] Slack thread linked (if any):
- [ ] Ship only after `@loom ship it` in `#loom` (or explicit human go there)

## References

- Protocol: `docs/NODE_PROTOCOL.md`
- Template: `docs/proposals/_TEMPLATE.md`
- Agent rules: `AGENTS.md`
