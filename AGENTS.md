# Agent guidelines — loom

**Owner:** loom Grok Bot (Pedro’s agent).  
**Repo:** [peterdays/loom](https://github.com/peterdays/loom) — private personal **temporal portfolio** (branching timeline of AI projects). A personal project graph.

## Hard boundaries

- **Read-only .**  is a personal notes. Sync may *read* it when a notes path is configured; this repo must **never** write into .
- **Stubs / samples only in git.** Never commit notes dumps, real private notes, client secrets, credentials, or unannounced/top-secret project details.
- **Pages stay off** until a deliberate public cutover after content review. Do not treat this as a live public site.
- **UI iteration autonomy remains.** loom may iterate HTML/CSS/JS skins, forks, and layout without per-step human approval.
- **Node content is always human-gated.** Never add or publish a timeline node from an unreviewed proposal.
- **Nodes stay small.** Short title + one-line summary. No essays.

## Node intake (summary)

Safer human gate (locked 2026-09-30; size/ clarifications same day):

1. A **author** drafts a **mini** public-safe proposal (prefer plain  message text — compact fenced YAML/JSON or labeled lines; `.md` attachment optional, not required). Shape: [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md).
2. Post to  **``**. The **thread is for iterating**: author + Pedro refine fields in-thread.
3. **Pedro** reviews / redacts until the fields look right.
4. Go signal: Pedro replies **`open a PR`** (case-insensitive; also accept “open a PR” when clearly @-addressing loom in that thread). That freezes the **latest human-approved** fields in the thread. If Pedro edits fields **in the ship message**, **those win**.
5. loom validates, merges one stub node, commits, pushes, confirms briefly in-thread.

Full protocol: **[`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md)**.  
Optional durable ticket: [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](.github/ISSUE_TEMPLATE/new-timeline-node.md) —  `open a PR` is the **primary** go signal; GitHub issues are alternate/tracking only.

## On `open a PR` ()

When Pedro (or clear human go from Pedro in that `` thread) says `open a PR`:

1. **Freeze** the latest human-approved fields from the thread (prior drafts + Pedro redacts). Prefer plain in-message text over attachments. **If Pedro puts field edits in the ship message itself, those override** earlier thread versions.
2. **Validate** against the projects schema + size budget (below). Refuse and say why in-thread if validation fails, size is over budget, or personal/secret/notes-looking content remains.
3. **Append** exactly **one** project object to **both**:
   - `data/projects.json`
   - `public/data/projects.json`  
   Keep those two files in sync (same `projects` array content for the new node).
4. **Commit** and **push** to `origin/main` (use `` / `` as configured).
5. **Confirm** briefly in the  thread (id + title + commit SHA or short OK).

### Never do

- Auto-publish from an unreviewed proposal or from draft/iterate messages alone.
- Act on  proposals **without** explicit `open a PR` (or clear human go) from Pedro in that thread.
- Ship long essays or multi-paragraph summaries — truncate/refuse; ask for a one-liner.
- Ship multiple nodes in one go unless Pedro explicitly asks.
- Write into  or paste notes paths / private note bodies into JSON.

## Required fields / validation

Each node object must match existing `projects.json` entries:

| Field | Rule |
|-------|------|
| `id` | kebab-case, unique across the array |
| `title` | short public title, **≤ ~60 characters** |
| `started` | `YYYY-MM` or `YYYY-MM-DD` |
| `ended` | `null` or same date format as `started` |
| `parent` | existing project `id`, or `null` for a new root |
| `summary` | **one sentence**, public-safe, **≤ ~160 characters**; no notes dumps/secrets |
| `tags` | lowercase strings, **≤ 5** tags |

Discourage long essays. Title + one-line summary is enough.

### Refuse if

- Missing/invalid fields, duplicate `id`, or `parent` that does not exist (unless `null`).
- Title/summary/tags over the size budget, or summary is multi-paragraph / essay-length.
- Summary/title/tags look like notes quotes, absolute notes paths, credentials, client secrets, or clearly private personal content Pedro has not redacted.
- Proposal was never reviewed / no `open a PR` (or equivalent clear go) in the thread.

## Default product facts agents should not regress

- Default **skin** is **Spores** (fork style default **Ribbon**). Ink Schematic and others remain available.
- Stub data only under `data/` and `public/data/`.
