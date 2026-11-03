#!/usr/bin/env python3
"""PR size check: at most 1,000 changed code lines and 20 code files per PR.

Usage: pr-size.py BASE [HEAD]   (diffs BASE...HEAD, i.e. from their merge-base)
Reads the PR description from $PR_BODY. Over a cap fails unless the body has a
"## Why this is large" section.
"""
import fnmatch
import os
import re
import subprocess
import sys

MAX_LINES = 1000
MAX_FILES = 20

# Paths that don't count toward either cap. The only exclusion list.
EXCLUDED = [
    "*.md",
    "docs/*",
    "*.lock", "package-lock.json", "pnpm-lock.yaml", "npm-shrinkwrap.json",
    "*.png", "*.jpg", "*.jpeg", "*.svg", "*.webp", "*.gif", "*.ico", "*.woff", "*.woff2",
    "public/data/projects.json",  # generated copy of data/projects.json (scripts/add-node.py)
]

JUSTIFIED = re.compile(r"^##\s+Why this is large\s*$", re.IGNORECASE | re.MULTILINE)


def excluded(path):
    return any(fnmatch.fnmatch(path, pat) for pat in EXCLUDED)


def numstat(base, head):
    """Yield (added, deleted, path) per changed file; renames use the new path."""
    out = subprocess.run(
        ["git", "diff", "--numstat", "-z", "-M", f"{base}...{head}"],
        check=True, capture_output=True, text=True,
    ).stdout
    fields = out.split("\0")
    i = 0
    while i < len(fields) and fields[i]:
        added, deleted, path = fields[i].split("\t", 2)
        if path == "":  # rename: old and new paths follow as separate fields
            path = fields[i + 2]
            i += 2
        i += 1
        # Binary files report "-"; they count as a file with no lines.
        yield (0 if added == "-" else int(added)), (0 if deleted == "-" else int(deleted)), path


def main():
    base = sys.argv[1]
    head = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
    lines = files = skipped = 0
    for added, deleted, path in numstat(base, head):
        if excluded(path):
            skipped += 1
            continue
        lines += added + deleted
        files += 1
    print(f"Counted: {lines} code lines, {files} files (caps {MAX_LINES} / {MAX_FILES}; {skipped} excluded files)")
    if lines <= MAX_LINES and files <= MAX_FILES:
        print("PASS: within both caps")
        return 0
    if JUSTIFIED.search(os.environ.get("PR_BODY", "")):
        print("PASS: over a cap, justified by a '## Why this is large' section")
        return 0
    print("FAIL: over a cap. Split the PR, or add a '## Why this is large' section to its description.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
