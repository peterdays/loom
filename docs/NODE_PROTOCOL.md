# Node intake protocol

**Locked decision (Pedro, 2026-09-30):** safer human gate before any timeline node lands in git.  
**Same-day clarifications:** nodes stay **small**; prefer **plain  message** mini proposals; the  **thread is for iterating**; only `open a PR` freezes and ships.

Primary path: author drafts a mini stub →  `` thread (iterate) → Pedro reviews/redacts → **`open a PR`** → loom bot adds the node.  
GitHub issue template remains as an **optional** durable ticket / alternate path; it is **not** required to ship.

Stubs only. Never notes dumps. Never write into . Pages stay off until deliberate public.

Agent checklist: see [`AGENTS.md`](../AGENTS.md). Shape reference: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).

---

## Size budget (nodes are small)

| Field | Budget |
|-------|--------|
| `title` | ≤ ~60 characters |
| `summary` | ≤ ~160 characters — **one sentence** |
| `tags` | ≤ 5 lowercase tags |

Short title + one-line summary is enough. **Discourage long essays.** If a draft is essay-length, trim or refuse and ask for a one-liner.

---

## Flow

1. **Draft (mini)** — A author (or human) proposes a **public-safe** stub. Prefer a **plain  message**: compact fenced YAML/JSON **or** labeled lines in the message body. A `.md` file attachment is optional, not required. Shape: [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md).
2. **Post to  ``** — Start (or continue) a thread. **The thread is for iterating ideas**: author + Pedro refine fields in-thread until they look right.
3. **Human review** — Pedro reviews and **redacts**:
   - personal / private life detail
   - client secrets and confidential work
   - unannounced or top-secret projects
   - notes paths and real private notes from 
   - fluff that blows the size budget
4. **Go signal** — Pedro replies in that thread with **`open a PR`** (case-insensitive). Also accept **“open a PR”** when the message clearly @-addresses loom in that same thread. That **freezes the latest human-approved fields** in the thread. **If Pedro edits fields in the ship message, those win** over earlier drafts.
5. **Ship** — loom validates against schema + size budget, refuses if junk/secrets/oversize remain, appends **one** project object to **both** `data/projects.json` and `public/data/projects.json`, commits, pushes, and confirms briefly in the  thread.
6. **Optional tracking** — Open a GitHub issue with [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](../.github/ISSUE_TEMPLATE/new-timeline-node.md) for a durable ticket. Label suggestion: `timeline-node`. **Not required** for ship;  `open a PR` is the primary gate.

---

## Trigger phrase

- Primary: `open a PR` (case-insensitive).
- Also: `open a PR` when clearly addressing loom in that `` proposal thread.
- **Thread = draft/iterate.** Draft messages alone never ship.
- **`open a PR` = freeze** latest approved fields and commit. Ship-message field edits override prior thread text.
- **No** auto-ship from an unreviewed draft. **No** action without that explicit go from Pedro (or clear human go in that thread).

---

## Preferred  shapes (in-message)

Compact fenced YAML:

```yaml
id: loom-node-protocol
title: Node intake protocol
started: 2026-09-30
ended: null
parent: temporal-loom-site
summary: Human-gated  mini stubs; ship only on open a PR.
tags: [process, stubs, ]
```

Or labeled lines (same fields, no fence required):

```
id: loom-node-protocol
title: Node intake protocol
started: 2026-09-30
ended: null
parent: temporal-loom-site
summary: Human-gated  mini stubs; ship only on open a PR.
tags: process, stubs, 
```

---

## Schema (must match `projects.json`)

```yaml
id: kebab-case unique
title: short public title (≤ ~60 chars)
started: YYYY-MM or YYYY-MM-DD
ended: null | same format
parent: existing id or null
summary: one public-safe sentence (≤ ~160 chars), no notes dumps
tags: [lowercase, ...]   # ≤ 5
```

---

## Rejection criteria

Refuse (and say why in-thread) when any of these apply:

- Missing required fields, bad date format, non-kebab `id`, or duplicate `id`.
- `parent` is set but no such project exists (use `null` for a new root).
- Over size budget (title/summary/tags) or essay-length summary.
- Content still looks personal, secret, client-confidential, or notes-sourced (paths, quoted private notes, credentials).
- Unannounced / top-secret project detail Pedro has not explicitly cleared for a public-safe stub.
- No `open a PR` (or clear equivalent go) from Pedro in the thread.
- Proposal asks to write into  or dump notes bodies into git.

---

## Example — good proposal ( mini)

```yaml
id: loom-node-protocol
title: Node intake protocol
started: 2026-09-30
ended: null
parent: temporal-loom-site
summary: Human-gated  mini stubs; ship only on open a PR.
tags: [process, stubs, ]
```

Why good: tiny, public-safe, parent exists, within size budget, no notes paths or secrets.

## Example — bad proposal

```yaml
id: client-x-secret-lane
title: Client X confidential rebuild of the entire Q4 engagement and strategy overhaul
started: 2026-09
ended: null
parent: personal-projects
summary: See /path/to/private-notes/example.md — API key sk-live-… and the private strategy doc. Also here is a long essay about every meeting, deliverable, and internal opinion that does not belong on a timeline stub at all.
tags: [client-x, secret, q4, strategy, meetings, essay]
```

Why bad: oversize title/summary/tags, real notes path, credential-looking string, confidential client work, essay tone. Pedro must reject or heavily redact; loom must refuse if such content remains at ship time.

---

## Autonomy split

| Area | Gate |
|------|------|
| UI / CSS / JS / skins / forks | loom may iterate (commit/push) without per-node human approval |
| Timeline **node content** | always human-gated via this protocol; thread iterates, `open a PR` freezes |
|  notes | read-only from loom tooling; never write |
| GitHub Pages public cutover | deliberate human decision after content review |
