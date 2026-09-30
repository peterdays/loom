# Node intake protocol

**Locked decision (Pedro, 2026-09-30):** safer human gate before any timeline node lands in git.

Primary path: author drafts →  `` → Pedro reviews/redacts → **`open a PR`** → loom bot adds the node.  
GitHub issue template remains as an **optional** durable ticket / alternate path; it is **not** required to ship.

Stubs only. Never notes dumps. Never write into . Pages stay off until deliberate public.

Agent checklist: see [`AGENTS.md`](../AGENTS.md). Proposal template: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).

---

## Flow

1. **Draft** — A author (or human) fills `docs/proposals/_TEMPLATE.md` with a **public-safe** summary only. No real notes quotes, no client secrets, no unannounced/top-secret detail.
2. **Post to ** — Post the `.md` (attachment) or a fenced markdown body to channel **``**.
3. **Human review** — Pedro reviews the thread and **redacts**:
   - personal / private life detail
   - client secrets and confidential work
   - unannounced or top-secret projects
   - notes paths and real private notes from 
4. **Go signal** — Pedro replies in that thread with **`open a PR`** (case-insensitive). Also accept **“open a PR”** when the message clearly @-addresses loom in that same thread. Optional: inline edits in the reply or an updated attachment — loom should ship the **approved** text.
5. **Ship** — loom validates against schema, refuses if junk/secrets remain, appends **one** project object to **both** `data/projects.json` and `public/data/projects.json`, commits, pushes, and confirms briefly in the  thread.
6. **Optional tracking** — Open a GitHub issue with [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](../.github/ISSUE_TEMPLATE/new-timeline-node.md) for a durable ticket. Label suggestion: `timeline-node`. **Not required** for ship;  `open a PR` is the primary gate.

---

## Trigger phrase

- Primary: `open a PR` (case-insensitive).
- Also: `open a PR` when clearly addressing loom in that `` proposal thread.
- **No** auto-ship from an unreviewed draft. **No** action on  proposals without that explicit go from Pedro (or clear human go in that thread).

---

## Schema (must match `projects.json`)

```yaml
id: kebab-case unique
title: short public title
started: YYYY-MM or YYYY-MM-DD
ended: null | same format
parent: existing id or null
summary: 1–2 sentences, public-safe, no notes dumps
tags: [lowercase, ...]
```

---

## Rejection criteria

Refuse (and say why in-thread) when any of these apply:

- Missing required fields, bad date format, non-kebab `id`, or duplicate `id`.
- `parent` is set but no such project exists (use `null` for a new root).
- Content still looks personal, secret, client-confidential, or notes-sourced (paths, quoted private notes, credentials).
- Unannounced / top-secret project detail Pedro has not explicitly cleared for a public-safe stub.
- No `open a PR` (or clear equivalent go) from Pedro in the thread.
- Proposal asks to write into  or dump notes bodies into git.

---

## Example — good proposal

```yaml
id: loom-node-protocol
title: Node intake protocol
started: 2026-09-30
ended: null
parent: temporal-loom-site
summary: Human-gated  flow so timeline stubs ship only after Pedro reviews and says open a PR.
tags: [process, stubs, ]
```

Why good: short, public-safe, parent exists, no notes paths or secrets.

## Example — bad proposal

```yaml
id: client-x-secret-lane
title: Client X confidential rebuild
started: 2026-09
ended: null
parent: personal-projects
summary: See /path/to/private-notes/example.md — API key sk-live-… and the private strategy doc.
tags: [client-x, secret]
```

Why bad: real notes path, credential-looking string, confidential client work, not public-safe. Pedro must reject or heavily redact; loom must refuse if such content remains at ship time.

---

## Autonomy split

| Area | Gate |
|------|------|
| UI / CSS / JS / skins / forks | loom may iterate (commit/push) without per-node human approval |
| Timeline **node content** | always human-gated via this protocol |
|  notes | read-only from loom tooling; never write |
| GitHub Pages public cutover | deliberate human decision after content review |
