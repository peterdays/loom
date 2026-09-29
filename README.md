# -ai-timeline

Temporary personal site: a **chronological timeline of AI projects**, fed from **** (Pedro’s personal personal notes / “”), a personal project timeline.

## Purpose

- Show what you’ve been building with AI, as a clean cyberpunk timeline.
- Keep the notes picky: this repo **reads**  (or a stub JSON). It does **not** write notes into the notes.

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

README.md
```

##  → timeline pipeline

1. **Stub (default):** `data/projects.json` ships with placeholder entries so the UI works offline.
2. **Sync (when notes is reachable):** set `` to a local checkout of  and run:

   ```bash
   export =/path/to/
   
   cp data/projects.json public/data/projects.json
   ```

   The script is a **heuristic stub** (scans markdown for AI/agent mentions). Tighten filters once the notes’s project-page convention is fixed.
3. **Manual:** edit `data/projects.json` (and copy to `public/data/`) when you don’t want auto-import.

Schema per project: `id`, `title`, `started`, `ended`, `summary`, `tags`, `links`.

## Notes

- Temporary / experimental repo under the personal GitHub account.
- Personal project timeline.
