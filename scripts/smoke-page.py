#!/usr/bin/env python3
"""Serve public/ and smoke-check the static page. Stdlib only.

Proves the page is wired, not merely that projects.json matches the schema:

  - GET / returns 200 (index.html)
  - linked styles.css and app.js return 200
  - the projects JSON URL app.js fetches returns JSON with a projects array
  - startup DOM hooks app.js queries still exist in index.html
  - html data-skin / data-fork-style match DEFAULT_SKIN / DEFAULT_FORK_STYLE
  - node --check public/app.js when node is on PATH

Usage (from the repo root):

  python3 scripts/smoke-page.py
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import threading
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
APP_JS = PUBLIC / "app.js"

# Classes stamped into the DOM after fetch (renderGraph / renderCards).
# They are not in index.html; the containers #graph and #cards are.
RENDERED_SELECTORS = {".node", ".card"}

SELECTOR_RE = re.compile(
    r"\.([A-Za-z_][\w-]*)(?::not\(\.([A-Za-z_][\w-]*)\))?"
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.elements: list[dict] = []
        self.html_attrs: dict[str, str] = {}
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        classes = set(ad.get("class", "").split())
        if tag == "html":
            self.html_attrs = ad
        if ad.get("id"):
            self.ids.add(ad["id"])
        self.elements.append({"tag": tag, "classes": classes, "attrs": ad})
        rel = set(ad.get("rel", "").split())
        if tag == "link" and "stylesheet" in rel and ad.get("href"):
            self.stylesheets.append(ad["href"])
        if tag == "script" and ad.get("src"):
            self.scripts.append(ad["src"])


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return


def fail(errors: list[str], msg: str) -> None:
    errors.append(msg)


def fetch(base: str, path_or_url: str) -> tuple[int, bytes]:
    url = urljoin(base, path_or_url)
    try:
        with urlopen(url, timeout=5) as resp:
            return resp.status, resp.read()
    except HTTPError as exc:
        return exc.code, exc.read()
    except URLError as exc:
        return 0, str(exc.reason).encode()


def path_of(href: str) -> str:
    return urlparse(urljoin("http://smoke.local/", href)).path


def const_string(js: str, name: str) -> str | None:
    match = re.search(rf"const\s+{name}\s*=\s*[\"']([^\"']+)[\"']", js)
    return match.group(1) if match else None


def quoted_calls(js: str, fn: str) -> list[str]:
    """First string argument of fn("..."). Allows further arguments."""
    return re.findall(rf"\b{fn}\(\s*[\"']([^\"']+)[\"']", js)


def selector_ok(selector: str, elements: list[dict]) -> bool:
    match = SELECTOR_RE.fullmatch(selector.strip())
    if not match:
        return False
    want, banned = match.group(1), match.group(2)
    for el in elements:
        if want in el["classes"] and (not banned or banned not in el["classes"]):
            return True
    return False


def check_dom(js: str, page: PageParser, errors: list[str]) -> None:
    for element_id in sorted(set(quoted_calls(js, "getElementById"))):
        if element_id not in page.ids:
            fail(errors, f'missing id="{element_id}" (getElementById in app.js)')

    for raw in sorted(set(quoted_calls(js, "querySelectorAll") + quoted_calls(js, "querySelector"))):
        if raw in RENDERED_SELECTORS:
            continue
        if not SELECTOR_RE.fullmatch(raw.strip()):
            fail(errors, f"unsupported selector {raw!r} — teach scripts/smoke-page.py")
            continue
        if not selector_ok(raw, page.elements):
            fail(errors, f"selector {raw} matches nothing in index.html")

    for attr in sorted(set(re.findall(r"dataset\.([A-Za-z_][\w-]*)", js))):
        data_attr = "data-" + attr
        if not any(data_attr in el["attrs"] for el in page.elements):
            fail(errors, f"missing {data_attr} (dataset.{attr} in app.js)")

    for attr in sorted(
        set(re.findall(r"document\.documentElement\.getAttribute\(\s*[\"']([^\"']+)[\"']\s*\)", js))
    ):
        if not page.html_attrs.get(attr):
            fail(errors, f"<html> missing {attr}")

    skin = const_string(js, "DEFAULT_SKIN")
    fork = const_string(js, "DEFAULT_FORK_STYLE")
    if not skin or not fork:
        fail(errors, "app.js missing DEFAULT_SKIN or DEFAULT_FORK_STYLE")
        return
    if page.html_attrs.get("data-skin") != skin:
        fail(errors, f'<html data-skin> is {page.html_attrs.get("data-skin")!r}, app default is {skin!r}')
    if page.html_attrs.get("data-fork-style") != fork:
        fail(
            errors,
            f'<html data-fork-style> is {page.html_attrs.get("data-fork-style")!r}, app default is {fork!r}',
        )

    skin_btn = [
        el
        for el in page.elements
        if "skin-btn" in el["classes"]
        and "fork-btn" not in el["classes"]
        and el["attrs"].get("data-skin") == skin
    ]
    fork_btn = [
        el
        for el in page.elements
        if "fork-btn" in el["classes"] and el["attrs"].get("data-fork") == fork
    ]
    if not skin_btn:
        fail(errors, f'no .skin-btn[data-skin="{skin}"]')
    elif "active" not in skin_btn[0]["classes"]:
        fail(errors, f'default skin button {skin!r} is missing class "active"')
    if not fork_btn:
        fail(errors, f'no .fork-btn[data-fork="{fork}"]')
    elif "active" not in fork_btn[0]["classes"]:
        fail(errors, f'default fork button {fork!r} is missing class "active"')


def check_node(errors: list[str]) -> str:
    node = shutil.which("node")
    if not node:
        return "node --check skipped (node not on PATH)"
    proc = subprocess.run([node, "--check", str(APP_JS)], capture_output=True, text=True)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "node --check failed").strip()
        fail(errors, "\n".join(detail.splitlines()[:8]))
        return "node --check failed"
    return "node --check ok"


def main() -> int:
    if not PUBLIC.is_dir() or not APP_JS.is_file():
        print("smoke failed: public/app.js not found", file=sys.stderr)
        return 1

    handler = partial(QuietHandler, directory=str(PUBLIC))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}/"
    errors: list[str] = []
    project_count = 0

    try:
        status, body = fetch(base, "/")
        if status != 200:
            fail(errors, f"GET / returned {status}, expected 200")
            page = PageParser()
        else:
            page = PageParser()
            page.feed(body.decode("utf-8", errors="replace"))

        js = APP_JS.read_text(encoding="utf-8")
        if status == 200:
            sheets = [href for href in page.stylesheets if path_of(href).endswith("/styles.css")]
            scripts = [src for src in page.scripts if path_of(src).endswith("/app.js")]
            if not sheets:
                fail(errors, "index.html does not link styles.css")
            if not scripts:
                fail(errors, "index.html does not load app.js")
            for href in sheets + scripts:
                asset_status, asset_body = fetch(base, href)
                if asset_status != 200 or not asset_body:
                    fail(errors, f"GET {href} returned {asset_status} (empty={not asset_body})")

            fetches = quoted_calls(js, "fetch")
            if not fetches:
                fail(errors, "app.js has no fetch() URL")
            for href in fetches:
                data_status, data_body = fetch(base, href)
                if data_status != 200:
                    fail(errors, f"GET {href} returned {data_status}")
                    continue
                try:
                    data = json.loads(data_body.decode("utf-8"))
                except json.JSONDecodeError as exc:
                    fail(errors, f"{href} is not JSON ({exc})")
                    continue
                projects = data.get("projects") if isinstance(data, dict) else None
                if not isinstance(projects, list):
                    fail(errors, f"{href} has no projects array")
                else:
                    project_count = len(projects)

            check_dom(js, page, errors)

        node_note = check_node(errors)
    finally:
        httpd.shutdown()
        httpd.server_close()

    if errors:
        print("smoke failed:", file=sys.stderr)
        for msg in errors:
            print(f"  - {msg}", file=sys.stderr)
        return 1

    print(
        "smoke ok: index 200, styles.css, app.js, "
        f"projects.json ({project_count} projects), startup DOM hooks, {node_note}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
