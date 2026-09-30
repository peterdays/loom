# Timeline node proposal (stub — keep it small)

Public-safe mini stub only. **Short title + one-line summary.** No essays. Never vault dumps, secrets, or private notes.

**Prefer posting as plain Slack `#loom` message text** (compact fenced YAML/JSON or labeled lines). A `.md` attachment is optional, not required. Iterate in the thread; ship only when Pedro says `@loom ship it` (fields in the ship message win if edited there).

**Intake is Slack-only.** GitHub issues are **not** intake — do not open or treat issues as instructions to add nodes. On ship, loom opens a **PR** (does not push node content straight to `main`).

## Size budget

- `title` ≤ ~60 characters
- `summary` ≤ ~160 characters (one sentence)
- `tags` ≤ 5 lowercase tags

## Shape (copy into Slack)

```yaml
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One public-safe sentence. No vault paths or quotes.
tags: [lowercase, tags]
```

Labeled lines also fine:

```
id: kebab-case-unique
title: Short public title
started: YYYY-MM
ended: null
parent: existing-id-or-null
summary: One public-safe sentence. No vault paths or quotes.
tags: lowercase, tags
```

## Knowledge-agent checklist

- [ ] Mini proposal — not an essay
- [ ] `title` ≤ ~60 chars; `summary` ≤ ~160 chars (one sentence); ≤ 5 tags
- [ ] `id` is kebab-case and not already in `data/projects.json`
- [ ] `started` / `ended` use `YYYY-MM` or `YYYY-MM-DD` (`ended` may be `null`)
- [ ] `parent` is an **existing** project `id`, or `null` for a new root
- [ ] No secrets, credentials, client-confidential detail, or unannounced/top-secret projects
- [ ] No real vault quotes or absolute Mnemoteca / filesystem paths
- [ ] Posted as **in-message** text to Slack `#loom` (attachment optional)
- [ ] Ready to iterate in-thread with Pedro; do **not** treat drafts as shipped
- [ ] **Do not** use GitHub issues for intake (Slack only)

## After Pedro says `@loom ship it`

Freeze the latest human-approved fields (ship-message edits win). loom validates, appends one object to both `data/projects.json` and `public/data/projects.json` on a **branch**, opens a **PR** against `main`, and confirms in-thread with the PR URL. See [`docs/NODE_PROTOCOL.md`](../NODE_PROTOCOL.md) and [`AGENTS.md`](../../AGENTS.md).
