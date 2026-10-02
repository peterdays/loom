#!/usr/bin/env python3
"""Append one timeline node to both data/projects.json and public/data/projects.json.

Validates against AGENTS.md field rules (stdlib; no heavy deps). Prefer this over
hand-editing JSON. Always run on a branch; open a PR — never push node content
straight to main.

Examples:
  python3 scripts/add-node.py --dry-run \\
    --id loom-agent-tooling --title "Agent node tooling" \\
    --started 2026-10-02 --parent temporal-loom-site \\
    --summary "Schema + add-node.py so bots append stubs safely." \\
    --tag process --tag agents --tag stub

  python3 scripts/add-node.py --validate-only
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "projects.json"
PUBLIC_PATH = ROOT / "public" / "data" / "projects.json"
SCHEMA_PATH = ROOT / "schemas" / "projects.schema.json"

KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}(-\d{2})?$")
TITLE_MAX = 60
SUMMARY_MAX = 160
TAGS_MAX = 5

# Soft refuse hints (not exhaustive — human gate still required)
SUSPICIOUS = re.compile(
    r"(jarvas-mnemoteca|/Users/|/home/\w+/|sk-live-|sk-[a-zA-Z0-9]{16,}|"
    r"api[_-]?key|password\s*[:=]|BEGIN (RSA |OPENSSH )?PRIVATE)",
    re.IGNORECASE,
)


def die(msg: str, code: int = 1) -> None:
    print(f"add-node: {msg}", file=sys.stderr)
    raise SystemExit(code)


def load_projects(path: Path) -> dict[str, Any]:
    if not path.is_file():
        die(f"missing {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        die(f"invalid JSON in {path}: {e}")
    if not isinstance(data, dict) or "projects" not in data:
        die(f"{path} must be an object with a 'projects' array")
    if not isinstance(data["projects"], list):
        die(f"{path}: 'projects' must be an array")
    return data


def ensure_in_sync(a: dict[str, Any], b: dict[str, Any]) -> None:
    if a.get("projects") != b.get("projects"):
        die(
            "data/projects.json and public/data/projects.json projects arrays differ; "
            "fix sync before appending"
        )


def validate_existing_file(data: dict[str, Any], path: Path) -> list[str]:
    """Validate whole file shape + uniqueness/parent refs. Returns error list."""
    errs: list[str] = []
    for key in ("source", "synced_at", "projects"):
        if key not in data:
            errs.append(f"{path.name}: missing top-level '{key}'")
    projects = data.get("projects")
    if not isinstance(projects, list):
        return errs + [f"{path.name}: projects must be an array"]

    ids: set[str] = set()
    for i, node in enumerate(projects):
        prefix = f"{path.name} projects[{i}]"
        if not isinstance(node, dict):
            errs.append(f"{prefix}: must be an object")
            continue
        node_errs = validate_node_fields(node, existing_ids=None, check_parent=False, soft_content=False)
        errs.extend(f"{prefix}: {e}" for e in node_errs)
        nid = node.get("id")
        if isinstance(nid, str):
            if nid in ids:
                errs.append(f"{prefix}: duplicate id '{nid}'")
            ids.add(nid)

    for i, node in enumerate(projects):
        if not isinstance(node, dict):
            continue
        parent = node.get("parent")
        nid = node.get("id")
        if parent is not None:
            if not isinstance(parent, str) or parent not in ids:
                errs.append(
                    f"{path.name} projects[{i}]: parent '{parent}' does not exist"
                )
            elif parent == nid:
                errs.append(f"{path.name} projects[{i}]: parent cannot equal id")
    return errs


def validate_node_fields(
    node: dict[str, Any],
    *,
    existing_ids: set[str] | None,
    check_parent: bool,
    soft_content: bool = True,
) -> list[str]:
    errs: list[str] = []
    required = ("id", "title", "started", "ended", "parent", "summary", "tags")
    for key in required:
        if key not in node:
            errs.append(f"missing field '{key}'")

    nid = node.get("id")
    if nid is not None:
        if not isinstance(nid, str) or not KEBAB.match(nid):
            errs.append("id must be kebab-case ([a-z0-9]+(?:-[a-z0-9]+)*)")
        elif existing_ids is not None and nid in existing_ids:
            errs.append(f"duplicate id '{nid}'")

    title = node.get("title")
    if title is not None:
        if not isinstance(title, str) or not title.strip():
            errs.append("title must be a non-empty string")
        elif len(title) > TITLE_MAX:
            errs.append(f"title over budget ({len(title)} > {TITLE_MAX})")

    started = node.get("started")
    if started is not None:
        if not isinstance(started, str) or not DATE.match(started):
            errs.append("started must be YYYY-MM or YYYY-MM-DD")

    ended = node.get("ended")
    if "ended" in node and ended is not None:
        if not isinstance(ended, str) or not DATE.match(ended):
            errs.append("ended must be null or YYYY-MM / YYYY-MM-DD")

    parent = node.get("parent")
    if "parent" in node and parent is not None:
        if not isinstance(parent, str) or not KEBAB.match(parent):
            errs.append("parent must be null or a kebab-case id")
        elif check_parent and existing_ids is not None and parent not in existing_ids:
            errs.append(f"parent '{parent}' does not exist (use null for a new root)")
        elif check_parent and parent == nid:
            errs.append("parent cannot equal id")

    summary = node.get("summary")
    if summary is not None:
        if not isinstance(summary, str) or not summary.strip():
            errs.append("summary must be a non-empty string")
        else:
            if len(summary) > SUMMARY_MAX:
                errs.append(f"summary over budget ({len(summary)} > {SUMMARY_MAX})")
            if "\n\n" in summary or summary.count("\n") > 1:
                errs.append("summary must be one sentence (no multi-paragraph)")

    tags = node.get("tags")
    if tags is not None:
        if not isinstance(tags, list):
            errs.append("tags must be an array")
        else:
            if len(tags) > TAGS_MAX:
                errs.append(f"tags over budget ({len(tags)} > {TAGS_MAX})")
            for t in tags:
                if not isinstance(t, str) or not KEBAB.match(t):
                    errs.append(f"tag '{t}' must be lowercase kebab-case")
                    break

    # Soft content refuse (new nodes only — existing stubs may mention vault names)
    if soft_content:
        blob = " ".join(
            str(node.get(k) or "")
            for k in ("title", "summary")
        ) + " " + " ".join(
            str(t) for t in (tags or []) if isinstance(tags, list)
        )
        if SUSPICIOUS.search(blob):
            errs.append(
                "title/summary/tags look like vault paths, credentials, or private content — redact"
            )

    unknown = set(node) - set(required)
    if unknown:
        errs.append(f"unknown fields: {sorted(unknown)}")

    return errs


def build_node(args: argparse.Namespace) -> dict[str, Any]:
    ended: Any = args.ended
    if ended is not None and str(ended).lower() in ("null", "none", ""):
        ended = None
    parent: Any = args.parent
    if parent is not None and str(parent).lower() in ("null", "none", ""):
        parent = None
    tags = list(args.tag or [])
    return {
        "id": args.id,
        "title": args.title,
        "started": args.started,
        "ended": ended,
        "parent": parent,
        "summary": args.summary,
        "tags": tags,
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Validate and append one loom timeline node to both projects.json files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--id", help="kebab-case unique id")
    p.add_argument("--title", help=f"short public title (≤ {TITLE_MAX} chars)")
    p.add_argument("--started", help="YYYY-MM or YYYY-MM-DD")
    p.add_argument(
        "--ended",
        default=None,
        help="null (default) or YYYY-MM / YYYY-MM-DD",
    )
    p.add_argument(
        "--parent",
        default=None,
        help="existing project id, or null for a new root (default: null)",
    )
    p.add_argument("--summary", help=f"one public-safe sentence (≤ {SUMMARY_MAX} chars)")
    p.add_argument(
        "--tag",
        action="append",
        dest="tag",
        default=None,
        help="lowercase tag (repeat, ≤ 5 total)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and print the node; do not write files",
    )
    p.add_argument(
        "--validate-only",
        action="store_true",
        help="validate existing dual JSON files (and schema file presence); do not append",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    data = load_projects(DATA_PATH)
    public = load_projects(PUBLIC_PATH)
    ensure_in_sync(data, public)

    file_errs = validate_existing_file(data, DATA_PATH)
    if file_errs:
        for e in file_errs:
            print(f"add-node: {e}", file=sys.stderr)
        die("existing projects.json failed validation")

    if not SCHEMA_PATH.is_file():
        print(f"add-node: warning: schema missing at {SCHEMA_PATH}", file=sys.stderr)

    if args.validate_only:
        print(
            f"ok: {len(data['projects'])} nodes; "
            f"data/ and public/data/ in sync; schema at {SCHEMA_PATH.relative_to(ROOT)}"
        )
        return

    needed = ("id", "title", "started", "summary")
    missing = [k for k in needed if getattr(args, k) is None]
    if missing:
        die(
            "missing required args: "
            + ", ".join(f"--{k}" for k in missing)
            + " (or use --validate-only)"
        )

    # Default ended/parent to null when omitted
    if args.ended is None:
        args.ended = None
    if args.parent is None:
        args.parent = None

    existing_ids = {
        n["id"] for n in data["projects"] if isinstance(n, dict) and "id" in n
    }
    node = build_node(args)
    errs = validate_node_fields(node, existing_ids=existing_ids, check_parent=True)
    if errs:
        for e in errs:
            print(f"add-node: refuse: {e}", file=sys.stderr)
        die("validation failed")

    if args.dry_run:
        print(json.dumps(node, indent=2, ensure_ascii=False))
        print("dry-run: would append to data/projects.json and public/data/projects.json")
        return

    data["projects"].append(node)
    public["projects"].append(node)
    # Keep projects arrays identical; leave source/synced_at as-is on each file
    # but projects content must match — rewrite public from data's projects
    public["projects"] = list(data["projects"])
    write_json(DATA_PATH, data)
    write_json(PUBLIC_PATH, public)
    print(f"appended {node['id']!r} ({len(data['projects'])} nodes total)")
    print("remember: commit on a branch and open a PR — do not push nodes straight to main")


if __name__ == "__main__":
    main()
