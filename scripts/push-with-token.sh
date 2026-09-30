#!/usr/bin/env bash
# Push origin/main using GITHUB_LOOM_PUSH_TOKEN (env or box-secrets card). Never echo the token.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${GITHUB_LOOM_PUSH_TOKEN:-}" ]]; then
  GITHUB_LOOM_PUSH_TOKEN="$(python3 - <<'PY'
import json
from pathlib import Path
paths = [Path("/home/box/agent-data/box-secrets.json"), Path("/home/box/sand-data/box-secrets.json")]
card = {}
for _path in paths:
    if _path.is_file():
        card = json.loads(_path.read_text()).get("card") or {}
        break
t = card.get("GITHUB_LOOM_PUSH_TOKEN")
if isinstance(t, dict):
    t = t.get("value") or t.get("secret") or t.get("token")
if not t:
    raise SystemExit("GITHUB_LOOM_PUSH_TOKEN missing")
print(t, end="")
PY
)"
  export GITHUB_LOOM_PUSH_TOKEN
fi

AUTH="$(python3 - <<'PY'
import os, base64
print(base64.b64encode(f"x-access-token:{os.environ['GITHUB_LOOM_PUSH_TOKEN']}".encode()).decode(), end="")
PY
)"

# Prefer HTTPS git push; on 403 fall back note for Git Data API
set +e
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH}" push "$@" origin HEAD:main
rc=$?
set -e
if [[ $rc -ne 0 ]]; then
  echo "git HTTPS push failed (rc=$rc). Use scripts/push-via-git-data-api.py for fine-grained PATs." >&2
  exit $rc
fi
