---
name: New timeline node
about: Optional durable ticket for a loom timeline stub. Primary ship gate is Slack @loom ship it in #loom (in-message mini proposal; thread iterates).
title: "timeline-node: "
labels: timeline-node
---

## Note

**Slack `#loom` + `@loom ship it` is the primary go signal.** Prefer a **plain Slack message** mini proposal (fenced YAML/JSON or labeled lines); `.md` attachment optional. The Slack **thread is for iterating**; only `@loom ship it` freezes the latest human-approved fields (edits in the ship message win).

This issue is an optional durable / alternate path for tracking. Do not treat issue creation alone as permission to merge a node.

Stubs only — **keep them small**. No vault dumps. No secrets. Never write into jarvas-mnemoteca.

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
summary: One public-safe sentence. No vault paths or quotes.
tags: [lowercase, tags]
```

## Checklist

- [ ] Mini stub within size budget (not an essay)
- [ ] Public-safe; Pedro (or clear human) has reviewed / redacted
- [ ] `parent` exists or is `null`
- [ ] No secrets / vault dumps
- [ ] Slack thread linked (if any):
- [ ] Ship only after `@loom ship it` in `#loom` (or explicit human go there); ship-message field edits win

## References

- Protocol: `docs/NODE_PROTOCOL.md`
- Template: `docs/proposals/_TEMPLATE.md`
- Agent rules: `AGENTS.md`
