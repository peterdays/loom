#!/usr/bin/env bash
# Read-only: jarvas-mnemoteca → data/projects.json (never write into the vault).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/data/projects.json"
PUBLIC_OUT="$ROOT/public/data/projects.json"
VAULT_PATH="${JARVAS_MNEMOTECA_PATH:-}"

if [[ -z "$VAULT_PATH" || ! -d "$VAULT_PATH" ]]; then
  echo "JARVAS_MNEMOTECA_PATH unset or missing. Keeping stub at $OUT" >&2
  exit 0
fi

export JARVAS_MNEMOTECA_PATH OUT PUBLIC_OUT
python3 << 'PY'
import json, os, pathlib, datetime, re
vault = pathlib.Path(os.environ["JARVAS_MNEMOTECA_PATH"])
out = pathlib.Path(os.environ["OUT"])
public_out = pathlib.Path(os.environ["PUBLIC_OUT"])
projects = []
for path in sorted(vault.rglob("*.md")):
    if "node_modules" in path.parts or path.name.lower() in {"readme.md", "agents.md", "schema.md", "index.md", "log.md"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    lower = text.lower()
    if not any(k in lower for k in ("ai ", " ai", "agent", "llm", "gpt", "claude", "grok")):
        continue
    # Prefer frontmatter title/date when present
    title = path.stem.replace("-", " ").title()
    started = None
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if m:
        fm = m.group(1)
        tm = re.search(r"^title:\s*[\"']?(.+?)[\"']?\s*$", fm, re.M)
        if tm:
            title = tm.group(1).strip()
        dm = re.search(r"^(?:created|updated|date):\s*(\d{4}-\d{2}-\d{2})", fm, re.M)
        if dm:
            started = dm.group(1)
    rel = str(path.relative_to(vault))
    summary = next((ln.strip("# ").strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("---")), rel)
    projects.append({
        "id": re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-")[:80],
        "title": title[:120],
        "started": started,
        "ended": null if False else None,
        "summary": (summary[:240] + ("…" if len(summary) > 240 else "")),
        "tags": ["mnemoteca"],
        "source_path": rel,
    })
payload = {
    "source": "jarvas-mnemoteca",
    "synced_at": datetime.datetime.utcnow().isoformat() + "Z",
    "projects": projects,
}
# Refuse to commit-looking dumps: if huge, keep stub
if len(projects) > 200:
    raise SystemExit("Refusing sync: >200 hits — tighten filters before writing")
text = json.dumps(payload, indent=2) + "\n"
out.write_text(text, encoding="utf-8")
public_out.parent.mkdir(parents=True, exist_ok=True)
public_out.write_text(text, encoding="utf-8")
print(f"Wrote {len(projects)} projects to {out}")
PY
