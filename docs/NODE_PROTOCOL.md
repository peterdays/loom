# Node intake protocol

**Locked decision (Pedro, 2026-09-30):** safer human gate before any timeline node lands in git.

Primary path: knowledge agent drafts → Slack `#loom` → Pedro reviews/redacts → **`@loom ship it`** → loom bot adds the node.  
GitHub issue template remains as an **optional** durable ticket / alternate path; it is **not** required to ship.

Stubs only. Never vault dumps. Never write into jarvas-mnemoteca. Pages stay off until deliberate public.

Agent checklist: see [`AGENTS.md`](../AGENTS.md). Proposal template: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).

---

## Flow

1. **Draft** — A knowledge agent (or human) fills `docs/proposals/_TEMPLATE.md` with a **public-safe** summary only. No real vault quotes, no client secrets, no unannounced/top-secret detail.
2. **Post to Slack** — Post the `.md` (attachment) or a fenced markdown body to channel **`#loom`**.
3. **Human review** — Pedro reviews the thread and **redacts**:
   - personal / private life detail
   - client secrets and confidential work
   - unannounced or top-secret projects
   - vault paths and real private notes from Mnemoteca
4. **Go signal** — Pedro replies in that thread with **`@loom ship it`** (case-insensitive). Also accept **“ship it”** when the message clearly @-addresses loom in that same thread. Optional: inline edits in the reply or an updated attachment — loom should ship the **approved** text.
5. **Ship** — loom validates against schema, refuses if junk/secrets remain, appends **one** project object to **both** `data/projects.json` and `public/data/projects.json`, commits, pushes, and confirms briefly in the Slack thread.
6. **Optional tracking** — Open a GitHub issue with [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](../.github/ISSUE_TEMPLATE/new-timeline-node.md) for a durable ticket. Label suggestion: `timeline-node`. **Not required** for ship; Slack `@loom ship it` is the primary gate.

---

## Trigger phrase

- Primary: `@loom ship it` (case-insensitive).
- Also: `ship it` when clearly addressing loom in that `#loom` proposal thread.
- **No** auto-ship from an unreviewed draft. **No** action on Slack proposals without that explicit go from Pedro (or clear human go in that thread).

---

## Schema (must match `projects.json`)

```yaml
id: kebab-case unique
title: short public title
started: YYYY-MM or YYYY-MM-DD
ended: null | same format
parent: existing id or null
summary: 1–2 sentences, public-safe, no vault dumps
tags: [lowercase, ...]
```

---

## Rejection criteria

Refuse (and say why in-thread) when any of these apply:

- Missing required fields, bad date format, non-kebab `id`, or duplicate `id`.
- `parent` is set but no such project exists (use `null` for a new root).
- Content still looks personal, secret, client-confidential, or vault-sourced (paths, quoted private notes, credentials).
- Unannounced / top-secret project detail Pedro has not explicitly cleared for a public-safe stub.
- No `@loom ship it` (or clear equivalent go) from Pedro in the thread.
- Proposal asks to write into jarvas-mnemoteca or dump vault bodies into git.

---

## Example — good proposal

```yaml
id: loom-node-protocol
title: Node intake protocol
started: 2026-09-30
ended: null
parent: temporal-loom-site
summary: Human-gated Slack flow so timeline stubs ship only after Pedro reviews and says @loom ship it.
tags: [process, stubs, slack]
```

Why good: short, public-safe, parent exists, no vault paths or secrets.

## Example — bad proposal

```yaml
id: client-x-secret-lane
title: Client X confidential rebuild
started: 2026-09
ended: null
parent: skynet-lane
summary: See /Users/pedro/jarvas-mnemoteca/Clients/X/notes.md — API key sk-live-… and the private strategy doc.
tags: [client-x, secret]
```

Why bad: real vault path, credential-looking string, confidential client work, not public-safe. Pedro must reject or heavily redact; loom must refuse if such content remains at ship time.

---

## Autonomy split

| Area | Gate |
|------|------|
| UI / CSS / JS / skins / forks | loom may iterate (commit/push) without per-node human approval |
| Timeline **node content** | always human-gated via this protocol |
| Mnemoteca vault | read-only from loom tooling; never write |
| GitHub Pages public cutover | deliberate human decision after content review |
