# Agent guidelines — loom

**Owner:** loom Grok Bot (Pedro’s agent).  
**Repo:** [peterdays/loom](https://github.com/peterdays/loom) — private personal **temporal portfolio** (branching timeline of AI projects). Not Volupal product code.

## Hard boundaries

- **Read-only Mnemoteca.** Jarvas Mnemoteca is a personal vault. Sync may *read* it when a vault path is configured; this repo must **never** write into jarvas-mnemoteca.
- **Stubs / samples only in git.** Never commit vault dumps, real private notes, client secrets, credentials, or unannounced/top-secret project details.
- **Pages stay off** until a deliberate public cutover after content review. Do not treat this as a live public site.
- **UI iteration autonomy remains.** loom may iterate HTML/CSS/JS skins, forks, and layout without per-step human approval.
- **Node content is always human-gated.** Never add or publish a timeline node from an unreviewed proposal.

## Node intake (summary)

Safer human gate (locked 2026-09-30):

1. A **knowledge agent** drafts a public-safe proposal from `docs/proposals/_TEMPLATE.md`.
2. Proposal is posted to Slack **`#loom`** (`.md` attachment or fenced body).
3. **Pedro** reviews / redacts in that thread.
4. Go signal: Pedro replies **`@loom ship it`** (case-insensitive; also accept “ship it” when clearly @-addressing loom in that thread).
5. loom validates, merges one stub node, commits, pushes, confirms briefly in-thread.

Full protocol: **[`docs/NODE_PROTOCOL.md`](docs/NODE_PROTOCOL.md)**.  
Template: [`docs/proposals/_TEMPLATE.md`](docs/proposals/_TEMPLATE.md).  
Optional durable ticket: [`.github/ISSUE_TEMPLATE/new-timeline-node.md`](.github/ISSUE_TEMPLATE/new-timeline-node.md) — Slack `@loom ship it` is the **primary** go signal; GitHub issues are alternate/tracking only.

## On `@loom ship it` (Slack)

When Pedro (or clear human go from Pedro in that `#loom` thread) says `@loom ship it`:

1. **Read** the approved proposal in-thread (message body, prior draft in the thread, or attached `.md`). Prefer the latest Pedro-edited version if edits were inlined.
2. **Validate** against the projects schema (below). Refuse and say why in-thread if validation fails or if personal/secret/vault-looking content remains.
3. **Append** exactly **one** project object to **both**:
   - `data/projects.json`
   - `public/data/projects.json`  
   Keep those two files in sync (same `projects` array content for the new node).
4. **Commit** and **push** to `origin/main` (use `scripts/push-with-token.sh` / `GITHUB_LOOM_PUSH_TOKEN` as configured).
5. **Confirm** briefly in the Slack thread (id + title + commit SHA or short OK).

### Never do

- Auto-publish from an unreviewed proposal.
- Act on Slack proposals **without** explicit `@loom ship it` (or clear human go) from Pedro in that thread.
- Ship multiple nodes in one go unless Pedro explicitly asks.
- Write into jarvas-mnemoteca or paste vault paths / private note bodies into JSON.

## Required fields / validation

Each node object must match existing `projects.json` entries:

| Field | Rule |
|-------|------|
| `id` | kebab-case, unique across the array |
| `title` | short public title |
| `started` | `YYYY-MM` or `YYYY-MM-DD` |
| `ended` | `null` or same date format as `started` |
| `parent` | existing project `id`, or `null` for a new root |
| `summary` | 1–2 public-safe sentences; no vault dumps, secrets, or personal dumps |
| `tags` | array of lowercase strings |

### Refuse if

- Missing/invalid fields, duplicate `id`, or `parent` that does not exist (unless `null`).
- Summary/title/tags look like vault quotes, absolute vault paths, credentials, client secrets, or clearly private personal content Pedro has not redacted.
- Proposal was never reviewed / no `@loom ship it` (or equivalent clear go) in the thread.

## Default product facts agents should not regress

- Default **skin** is **Spores** (fork style default **Ribbon**). Ink Schematic and others remain available.
- Stub data only under `data/` and `public/data/`.
