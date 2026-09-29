# loom

Personal **temporal loom** — a cyberpunk branching timeline of AI projects, with room for later tabs (e.g. a presentation page).

Fed **read-only** from **** (Pedro’s personal personal notes). A personal project graph.

## Status

**Private build sandbox.** Do not assume a public site.

GitHub Pages on a free account only works for **public** repos (private Pages is paid). Pages should go live only when this repo is **deliberately made public** and the content is reviewed for what may appear on the open web. Until then: local static preview only.

```bash
python3 -m http.server 8080 --directory public
```

## Temporal graph

`public/` draws a **main time spine** with **project nodes on branches** (Loki / temporal-weave feel), plus a card list. Data: `public/data/projects.json`.

##  → loom pipeline

1. Stub JSON ships with non-sensitive sample projects.
2. Sync (when a notes checkout exists):

   ```bash
   export =/path/to/
   
   ```

   notes → site only. **Never** write into  from this repo.
3. Review `data/projects.json` before any future public Pages cutover — no private personal notes dumps on the public web.

## Layout

```
data/projects.json
public/index.html|styles.css|app.js|data/projects.json

README.md
```

## Agent autonomy

The `loom` Grok Bot owns iteration on UI + sync (commit/push to this private repo without per-step approval). Sensitive notes content stays out of git.
