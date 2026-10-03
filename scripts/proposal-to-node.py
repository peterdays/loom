#!/usr/bin/env python3
"""Turn a filled timeline-node proposal into an add-node.py command.

Reads a markdown file (or stdin) shaped like docs/proposals/_TEMPLATE.md:
a fenced YAML/JSON block, or labeled lines (id:, title:, …). Does not
reimplement validation — it calls scripts/add-node.py.

Default is a dry-run (no writes). Pass --apply to append one node on the
current branch. Still open a PR; do not push node content straight to main.

Examples:
  python3 scripts/proposal-to-node.py docs/proposals/some-filled-proposal.md
  python3 scripts/proposal-to-node.py --print-argv <<'EOF'
  id: example-project
  title: Example project
  started: 2026-10-02
  ended: null
  parent: null
  summary: One public-safe sentence.
  tags: [process]
  EOF
  python3 scripts/proposal-to-node.py docs/proposals/some-filled-proposal.md --apply
"""
from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ADD_NODE = Path(__file__).resolve().parent / "add-node.py"
FIELDS = ("id", "title", "started", "ended", "parent", "summary", "tags")
FENCE = re.compile(r"```([A-Za-z0-9_-]*)[^\n]*\n(.*?)```", re.DOTALL)
LABELED = re.compile(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$")
BLOCK_SCALAR = {"|", ">", "|-", ">-", "|+", ">+"}


def die(msg: str, code: int = 1) -> None:
    print(f"proposal-to-node: {msg}", file=sys.stderr)
    raise SystemExit(code)


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def parse_scalar(value: str) -> str | None:
    text = unquote(value)
    if text.lower() in ("null", "none", "~", ""):
        return None
    return text


def parse_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [unquote(str(item)) for item in value if str(item).strip()]
    text = str(value).strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1].strip()
        if not text:
            return []
        return [unquote(part) for part in text.split(",") if part.strip()]
    if "," in text:
        return [unquote(part) for part in text.split(",") if part.strip()]
    if not text or text.lower() in ("null", "none", "~"):
        return []
    return [unquote(text)]


def normalize(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("id", "title", "started", "summary"):
        if data.get(key) is None:
            continue
        out[key] = unquote(str(data[key]).strip())
    for key in ("ended", "parent"):
        raw = data.get(key)
        if isinstance(raw, str):
            out[key] = parse_scalar(raw)
        elif key in data:
            out[key] = raw if raw else None
        else:
            out[key] = None
    out["tags"] = parse_tags(data.get("tags"))
    return out


def parse_labeled(body: str) -> dict[str, Any]:
    data: dict[str, Any] = {}
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        match = LABELED.match(lines[i])
        if not match:
            i += 1
            continue
        key = match.group(1).lower()
        rest = match.group(2).strip()
        if key not in FIELDS:
            i += 1
            continue
        if rest in BLOCK_SCALAR or rest == "":
            if key == "tags" and rest == "":
                items: list[str] = []
                j = i + 1
                while j < len(lines):
                    item = re.match(r"^\s+-\s+(.*)$", lines[j])
                    if not item:
                        break
                    items.append(unquote(item.group(1)))
                    j += 1
                if not items:
                    die("tags: expected a list on the same line or a '-' block")
                data[key] = items
                i = j
                continue
            if key in ("ended", "parent") and rest == "":
                data[key] = None
                i += 1
                continue
            die(f"{key}: put the value on the same line")
        data[key] = rest
        i += 1
    return data


def parse_body(body: str) -> dict[str, Any]:
    stripped = body.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        parsed = json.loads(stripped)
        if not isinstance(parsed, dict):
            raise ValueError("JSON proposal must be an object")
        return normalize(parsed)
    return normalize(parse_labeled(stripped))


def candidate_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    for match in FENCE.finditer(text):
        lang = match.group(1).lower()
        body = match.group(2).strip()
        if lang in ("yaml", "yml", "json"):
            blocks.append(body)
        elif lang in ("", "text", "md") and re.search(r"(?m)^id\s*:", body):
            blocks.append(body)
    return blocks


def parse_proposal(text: str) -> dict[str, Any]:
    errors: list[str] = []
    for body in candidate_blocks(text):
        try:
            fields = parse_body(body)
        except json.JSONDecodeError as exc:
            errors.append(f"fenced JSON: {exc}")
            continue
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if fields.get("id") and fields.get("title"):
            return fields
    try:
        fields = parse_body(text)
    except json.JSONDecodeError as exc:
        die(f"could not parse proposal JSON: {exc}")
    except ValueError as exc:
        die(str(exc))
    if fields.get("id") and fields.get("title"):
        return fields
    detail = f" ({'; '.join(errors)})" if errors else ""
    die("no proposal fields found; need id and title in fenced YAML/JSON or labeled lines" + detail)
    raise AssertionError("unreachable")


def build_add_node_args(fields: dict[str, Any]) -> list[str]:
    missing = [key for key in ("id", "title", "started", "summary") if not fields.get(key)]
    if missing:
        die("proposal missing " + ", ".join(missing))
    ended = fields.get("ended")
    parent = fields.get("parent")
    args = [
        "--id", str(fields["id"]),
        "--title", str(fields["title"]),
        "--started", str(fields["started"]),
        "--ended", "null" if not ended else str(ended),
        "--parent", "null" if not parent else str(parent),
        "--summary", str(fields["summary"]),
    ]
    for tag in fields.get("tags") or []:
        args.extend(["--tag", str(tag)])
    return args


def format_argv(args: list[str], *, dry_run: bool) -> str:
    display = ["python3", "scripts/add-node.py", *args]
    if dry_run:
        display.append("--dry-run")
    return " ".join(shlex.quote(part) for part in display)


def run_add_node(args: list[str], *, dry_run: bool, capture: bool) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, str(ADD_NODE), *args]
    if dry_run:
        cmd.append("--dry-run")
    return subprocess.run(cmd, cwd=ROOT, capture_output=capture, text=True)


def read_proposal(path: str | None) -> str:
    if path is None or path == "-":
        if path is None and sys.stdin.isatty():
            die("pass a proposal path, or pipe YAML/labeled fields on stdin")
        return sys.stdin.read()
    file = Path(path)
    if not file.is_file():
        die(f"not a file: {path}")
    return file.read_text(encoding="utf-8")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse a loom node proposal and call scripts/add-node.py.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "path",
        nargs="?",
        help="proposal markdown path, or - for stdin",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="print the add-node argv and validate without writing (default)",
    )
    mode.add_argument(
        "--print-argv",
        action="store_true",
        help="print the add-node.py command after a successful dry-run validation",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="append the node by calling add-node.py (writes both projects.json files)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    if not ADD_NODE.is_file():
        die(f"missing {ADD_NODE}")
    fields = parse_proposal(read_proposal(args.path))
    add_args = build_add_node_args(fields)
    dry_run = not args.apply
    line = format_argv(add_args, dry_run=dry_run)

    if args.print_argv:
        proc = run_add_node(add_args, dry_run=True, capture=True)
        if proc.returncode != 0:
            if proc.stderr:
                sys.stderr.write(proc.stderr)
            if proc.stdout:
                sys.stderr.write(proc.stdout)
            raise SystemExit(proc.returncode)
        # Validated via dry-run; print the append command (no --dry-run).
        print(format_argv(add_args, dry_run=False))
        return

    print(f"argv: {line}", file=sys.stderr, flush=True)
    proc = run_add_node(add_args, dry_run=dry_run, capture=False)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)
    if args.apply:
        print("proposal-to-node: appended via add-node.py — commit on a branch and open a PR")


if __name__ == "__main__":
    main()
