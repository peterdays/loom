---
name: "Add a node by pull request"
about: Timeline nodes are added with scripts/add-node.py in a pull request. Filing an issue does not add a node.
title: ""
labels: timeline-node
---

## Add a node with a pull request

Filing this issue does not add a timeline node.

Open a pull request that adds one node via `scripts/add-node.py`. A reviewer checks the graph and the page still work (`python3 scripts/add-node.py --validate-only` and `python3 scripts/smoke-page.py`).

## References

- Protocol: `docs/NODE_PROTOCOL.md`
- Template: `docs/proposals/_TEMPLATE.md`
- Agent rules: `AGENTS.md`
