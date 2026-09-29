# jarvas-ai-timeline

Temporary personal site: a **chronological timeline of AI projects**, fed from **Jarvas Mnemoteca** (Pedro’s personal second brain / “MinimoTeca”), not from Volupal miolo.

## Purpose

- Show what you’ve been building with AI, as a clean cyberpunk timeline.
- Keep the vault picky: this repo **reads** Mnemoteca (or a stub JSON). It does **not** write notes into the vault.

## Quick start

```bash
# from repo root — any static server
python3 -m http.server 8080 --directory public
# open http://localhost:8080
```

## Layout

```
data/projects.json          # SoT JSON used by the sync script (canonical export)
public/
  index.html                # timeline page
  styles.css                # cyberpunk theme
  app.js                    # loads JSON, sorts newest-first
  data/projects.json        # copy served to the browser
scripts/sync-from-mnemoteca.sh
README.md
```

## Mnemoteca → timeline pipeline

1. **Stub (default):** `data/projects.json` ships with placeholder entries so the UI works offline.
2. **Sync (when vault is reachable):** set `JARVAS_MNEMOTECA_PATH` to a local checkout of jarvas-mnemoteca and run:

   ```bash
   export JARVAS_MNEMOTECA_PATH=/path/to/jarvas-mnemoteca
   ./scripts/sync-from-mnemoteca.sh
   cp data/projects.json public/data/projects.json
   ```

   The script is a **heuristic stub** (scans markdown for AI/agent mentions). Tighten filters once the vault’s project-page convention is fixed.
3. **Manual:** edit `data/projects.json` (and copy to `public/data/`) when you don’t want auto-import.

Schema per project: `id`, `title`, `started`, `ended`, `summary`, `tags`, `links`.

## Notes

- Temporary / experimental repo under the personal GitHub account.
- Distinct from Volupal `zacarias-miolo` — do not mix fleet vault writes here.
