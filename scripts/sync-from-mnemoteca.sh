#!/usr/bin/env bash
# Stub: pull chronological AI-project notes from jarvas-mnemoteca into data/projects.json.
# Real wiring expects a local or CI checkout of the personal vault (read-only).
# Do NOT auto-write into the vault — this pipeline is vault → site only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/data/projects.json"
VAULT_PATH="${JARVAS_MNEMOTECA_PATH:-}"

if [[ -z "$VAULT_PATH" || ! -d "$VAULT_PATH" ]]; then
  echo "JARVAS_MNEMOTECA_PATH unset or missing. Leaving stub data at $OUT" >&2
  echo "Set it to your jarvas-mnemoteca checkout, then re-run." >&2
  exit 0
fi

# Placeholder transform: look for wiki pages tagged / titled as AI projects.
# Replace this block with a real extractor (frontmatter dates + titles) when the vault schema is fixed.
python3 - << PY
import json, os, pathlib, datetime
vault = pathlib.Path(os.environ["JARVAS_MNEMOTECA_PATH"])
projects = []
for path in sorted(vault.rglob("*.md")):
    text = path.read_text(encoding="utf-8", errors="ignore")
    # Heuristic stub: only files that mention AI project markers
    lower = text.lower()
    if "ai" not in lower and "agent" not in lower:
        continue
    rel = str(path.relative_to(vault))
    projects.append({
        "id": rel.replace("/", "-").replace(".md", ""),
        "title": path.stem.replace("-", " ").title(),
        "started": None,
        "ended": None,
        "summary": f"Imported stub from {rel} (refine filters in sync-from-mnemoteca.sh).",
        "tags": ["mnemoteca", "auto"],
        "links": [],
        "source_path": rel,
    })
out = {
    "source": "jarvas-mnemoteca",
    "synced_at": datetime.datetime.utcnow().isoformat() + "Z",
    "projects": projects or json.load(open("$OUT"))["projects"],
}
pathlib.Path("$OUT").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(out['projects'])} projects to $OUT")
PY
