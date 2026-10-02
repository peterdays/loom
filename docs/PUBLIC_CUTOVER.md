# Public cutover

**Visibility stays private.** This note is the pre-public scan record (2026-10-02). Do not enable GitHub Pages and do not change repository visibility from a pull request. Flip the repo to public by hand after this checklist is merged and reviewed.

Scanned ref: `main` at `d726187` (`ci: smoke-check the static page`), plus `origin/agent/node-tooling-schema-add-node` (`adffd56`). 21 commits, every blob reachable from `git rev-list --objects --all`.

## How it was scanned

- Current tree: ripgrep plus a full read of scripts, docs, JSON, and the page.
- History: every git blob (90 text blobs). Patterns covered GitHub PATs (`ghp_`, `github_pat_`, and the other `gh*_` forms), AWS access-key ids, Slack tokens, Slack webhooks, OpenAI-style secret keys, PEM private keys, bearer tokens, JWTs, npm tokens, assignment-style secrets, email addresses, absolute home-directory paths, and Slack-like ids.
- `gitleaks` and `trufflehog` were not installed in the scan environment. The history is small enough that the blob walk covered the same surface.

## BLOCKER — fixed on this branch

No live token, password, private key, or webhook secret was found in any blob. These items were still unfit to publish and are removed or anonymized on the tip:

| Item | Why it mattered | What changed |
|------|-----------------|--------------|
| `scripts/push-with-token.sh` | Read a GitHub push token from a local secrets file (two absolute paths under the agent host home directory) and pushed `HEAD` to `main`. The token value was never in the file. The paths were. | Deleted. `.gitignore` now ignores that script and the Git Data API helper it named (that helper was never committed). |
| README product codename | An internal company repo name sat next to the “not product code” boundary. | README now says “Not company product code.” The codename is not repeated here. |
| Bad-proposal example in `docs/NODE_PROTOCOL.md` | The teaching example used a real-looking `/Users/<name>/…` vault path. | Replaced with `/path/to/private-vault/notes.md` and a clearly fake `sk-live-EXAMPLE`. The example is still a refusal specimen. |
| `source_path` in `scripts/sync-from-mnemoteca.sh` | A sync run would have written vault-relative paths into both JSON files. Nothing in the committed JSON used that field. | Field dropped. Sync prints a review warning. Summaries are still copied from note text — do not commit a sync result without reading it. |

`.gitignore` also ignores `.env.*`, PEM/key material, `id_rsa` / `id_ed25519`, `secrets.json`, `box-secrets.json`, and credential JSON/YAML.

## Intentional public-safe stubs (left as-is)

- `data/projects.json` and `public/data/projects.json` are short sample nodes (Skynet / Jarvas, Mnemoteca curation, loom site, agent fleet, graph, tooling). They name the vault and say the lane sits outside Volupal. They do not quote notes, name internal repos, or contain paths.
- Slack `#loom` is a channel **name** in the intake protocol. No Slack channel id or workspace id appears.
- Jarvas Mnemoteca stays in the protocol as the read-only vault. The README sync example uses `JARVAS_MNEMOTECA_PATH=/path/to/vault`.
- The bad-proposal `sk-live-EXAMPLE` string is a fake marker so the refusal docs still show what to reject.

## Residual risk (history not rewritten)

Making the repo public publishes **all** history. The strings below remain reachable with `git log -p` / `git show`. They are not credential values, so history was **not** rewritten (a rewrite would need `git filter-repo` and a force-push to `main`).

| Residual | Where | Practical risk |
|----------|--------|----------------|
| Body of `scripts/push-with-token.sh`, including absolute secret-store paths and the push-token env var name | Added in `a05e8d5`, present through `d726187` | Describes a local secret-store layout. Does not contain the token. |
| Internal product codename, and the vault nickname from the first README | Initial README in `6f43088`; codename still in README until this branch | Old docs only. |
| `/Users/<name>/…` vault path inside the labeled bad proposal | `docs/NODE_PROTOCOL.md` from `9db1434` until this branch | Home-directory username in an example. Not a real note. |
| Commit author `loom` at a company bot domain | Most commits from `9db1434` through `adffd56` | Bot address in commit metadata only. |
| Commit authors via `users.noreply.github.com` (including the GitHub numeric user id) | Several commits | No personal mailbox. The GitHub user id is already public on the profile. |

No `.env`, credentials file, or untracked token script was in the tree.

Sync still builds node **ids** from the vault-relative path. A committed sync can still spell folder names inside `id`. Review before commit.

## Checklist before “Make public”

1. Merge this pull request.
2. On the tip, confirm `scripts/push-with-token.sh` is gone, no `.env` is tracked, and a search for `/home/` and `/Users/` hits only the generic placeholders in the protocol docs (`/path/to/vault`, `/path/to/private-vault/notes.md`).
3. Optional, **before** flipping visibility, only if those history residuals must disappear: back up the repo, rewrite with `git filter-repo` (drop `scripts/push-with-token.sh`, replace the historical home path and the product codename), and force-push `main`. Do that as a separate explicit step. This pull request does not.
4. GitHub → Settings → General → Change visibility → Public.
5. Leave GitHub Pages **off** until a separate content review.
6. The push token was not in git. Rotate it only if it was pasted into a chat, shell history, or another store outside this repository.

After step 4, update the README status line and the page footer that still say the sandbox is private.
