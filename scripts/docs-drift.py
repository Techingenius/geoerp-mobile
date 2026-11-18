#!/usr/bin/env python3
"""Advisory docs-drift detector (GRA-966 · A19).

Reads the PR's `Docs:` line and the map in `.github/doc-map.yml`, and warns when
a PR changes code that a doc page describes without touching that page.

It NEVER fails a build: every finding is a warning, and the exit code is 0
unless the map itself is broken (2) — a broken map should be fixed, not ignored.
The real safety net is the weekly docs autopilot; this only catches drift early.

Where it runs:
  * GitHub Actions: `.github/workflows/docs-drift.yml` (advisory, not required)
  * Locally:        `python3 scripts/docs-drift.py --base origin/<default> --gh-pr`
                    (`scripts/ci-local.sh` calls it where that script exists)

Checks:
  1. The PR body has exactly one valid `Docs:` line:
       Docs: ninguno | ADR | página | seguimiento GRA-123
  2. Code mapped to a doc page changed, but the page did not.
     `seguimiento GRA-N` acknowledges it; anything else gets a warning.
  3. `Docs: página` with no doc file changed; `Docs: ADR` with no ADR changed.
  4. The PR closes GRA-N and a page under `notice_roots` still names GRA-N
     (usually a `:::warning[Hoy: …]` notice that should go in the same PR).

Standard library only, so it runs on any runner or laptop with python3.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import unicodedata

MAP_DEFAULT = ".github/doc-map.yml"
VALID = "ninguno | ADR | página | seguimiento GRA-123"


# ── tiny loader for the restricted YAML shape of doc-map.yml ────────────────
# Top-level keys hold a list of strings, except `pages`, which holds a list of
# `{docs: <str|list>, code: <list>}`. Comments and blank lines are ignored.
class MapError(Exception):
    pass


def _scalar(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        return s[1:-1]
    return s


def load_map(path: str) -> dict:
    data: dict = {"docs_roots": [], "adr": [], "notice_roots": [], "pages": []}
    key = None
    page = None
    sub = None
    with open(path, encoding="utf-8") as fh:
        for n, raw in enumerate(fh, 1):
            line = raw.split(" #", 1)[0].rstrip() if not raw.lstrip().startswith("#") else ""
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip())
            text = line.strip()
            if indent == 0:
                m = re.fullmatch(r"([a-z_]+):", text)
                if not m or m.group(1) not in data:
                    raise MapError(f"{path}:{n}: unknown top-level key {text!r}")
                key, page, sub = m.group(1), None, None
                continue
            if key is None:
                raise MapError(f"{path}:{n}: indented line before any key")
            if key != "pages":
                if not text.startswith("- "):
                    raise MapError(f"{path}:{n}: expected '- <glob>' under {key}")
                data[key].append(_scalar(text[2:]))
                continue
            # pages
            m = re.fullmatch(r"(- )?(docs|code):\s*(.*)", text)
            if m:
                if m.group(1):
                    page = {"docs": [], "code": [], "line": n}
                    data["pages"].append(page)
                if page is None:
                    raise MapError(f"{path}:{n}: '{m.group(2)}:' outside a '- docs:' entry")
                sub = m.group(2)
                if m.group(3):
                    page[sub].append(_scalar(m.group(3)))
                continue
            if text.startswith("- ") and page is not None and sub:
                page[sub].append(_scalar(text[2:]))
                continue
            raise MapError(f"{path}:{n}: cannot parse {text!r}")
    for p in data["pages"]:
        if not p["docs"] or not p["code"]:
            raise MapError(f"{path}:{p['line']}: each page needs both 'docs' and 'code'")
    return data


# ── globbing: `**` crosses directories, `*` does not ────────────────────────
def glob_re(pattern: str) -> re.Pattern:
    out, i = "", 0
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif c == "*":
            out += "[^/]*"
            i += 1
        elif c == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(c)
            i += 1
    return re.compile(out + r"\Z")


def matching(files: list[str], globs: list[str]) -> list[str]:
    regs = [glob_re(g) for g in globs]
    return [f for f in files if any(r.match(f) for r in regs)]


# ── git / gh helpers ─────────────────────────────────────────────────────────
def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def changed_files(base: str, head: str) -> list[str]:
    mb = git("merge-base", base, head).strip()
    return [f for f in git("diff", "--name-only", f"{mb}...{head}").splitlines() if f]


def pr_body_from_gh() -> str | None:
    try:
        r = subprocess.run(["gh", "pr", "view", "--json", "body", "-q", ".body"],
                           capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


# ── the `Docs:` line ─────────────────────────────────────────────────────────
def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def parse_docs_line(body: str) -> tuple[str | None, str | None, str]:
    """Return (kind, followup_key, problem). kind ∈ ninguno|adr|pagina|seguimiento."""
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    lines = [m.group(1).strip() for m in re.finditer(r"(?mi)^[\s>*_-]*docs:\**\s*(.*)$", body)]
    if not lines:
        return None, None, f"el cuerpo del PR no tiene línea `Docs:`. Agregá una: `Docs: {VALID}`"
    if len(lines) > 1:
        return None, None, f"hay {len(lines)} líneas `Docs:`; dejá una sola"
    value = lines[0].strip("`* ")
    folded = _fold(value)
    if folded in ("ninguno", "ninguna", "none"):
        return "ninguno", None, ""
    if folded == "adr":
        return "adr", None, ""
    if folded in ("pagina", "page"):
        return "pagina", None, ""
    m = re.fullmatch(r"seguimiento\s+(gra-\d+)", folded)
    if m:
        return "seguimiento", m.group(1).upper(), ""
    if "|" in value:
        return None, None, f"la línea `Docs:` sigue con todas las opciones; elegí una: `{VALID}`"
    return None, None, f"`Docs: {value}` no es un valor válido. Opciones: `{VALID}`"


def closed_keys(body: str) -> list[str]:
    return sorted(set(k.upper() for k in re.findall(r"(?i)\b(?:closes|fixes|resolves)\s+(GRA-\d+)\b", body)))


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Advisory docs-drift detector (never fails the build).")
    ap.add_argument("--base", default=os.environ.get("DOCS_DRIFT_BASE", "origin/HEAD"))
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--map", default=MAP_DEFAULT)
    ap.add_argument("--body-file", help="file with the PR body (default: $PR_BODY)")
    ap.add_argument("--gh-pr", action="store_true", help="read the body with `gh pr view` for this branch")
    ap.add_argument("--markdown", help="also write the findings as Markdown to this file")
    a = ap.parse_args()

    try:
        dmap = load_map(a.map)
    except (OSError, MapError) as e:
        print(f"docs-drift: mapa roto: {e}", file=sys.stderr)
        return 2

    body = None
    if a.body_file:
        with open(a.body_file, encoding="utf-8") as fh:
            body = fh.read()
    elif "PR_BODY" in os.environ:
        body = os.environ["PR_BODY"]
    elif a.gh_pr:
        body = pr_body_from_gh()

    try:
        files = changed_files(a.base, a.head)
    except subprocess.CalledProcessError as e:
        print(f"docs-drift: no pude calcular el diff contra {a.base}: {e.stderr.strip()}", file=sys.stderr)
        return 0

    warns: list[str] = []
    notes: list[str] = []

    kind, followup = None, None
    if body is None:
        notes.append("sin cuerpo de PR: no reviso la línea `Docs:` (pasá `--gh-pr` o `--body-file`)")
    else:
        kind, followup, problem = parse_docs_line(body)
        if problem:
            warns.append(problem)

    doc_changed = matching(files, dmap["docs_roots"])
    adr_changed = matching(files, dmap["adr"])

    for p in dmap["pages"]:
        hits = matching(files, p["code"])
        if not hits or matching(files, p["docs"]):
            continue
        pages = ", ".join(f"`{d}`" for d in p["docs"])
        shown = ", ".join(f"`{h}`" for h in hits[:3]) + (f" y {len(hits) - 3} más" if len(hits) > 3 else "")
        if kind == "seguimiento":
            notes.append(f"{pages} queda para {followup} (cambió {shown})")
        else:
            warns.append(f"cambió {shown} y {pages} no. Si la página sigue siendo cierta, ignoralo; "
                         f"si no, actualizala en este PR o poné `Docs: seguimiento GRA-N`")

    if kind == "pagina" and not doc_changed:
        warns.append("`Docs: página` pero el PR no cambia ningún archivo de documentación")
    if kind == "adr" and dmap["adr"] and not adr_changed:
        warns.append("`Docs: ADR` pero el PR no agrega ni cambia ningún ADR")

    if body and dmap["notice_roots"]:
        for key in closed_keys(body):
            try:
                out = subprocess.run(["git", "grep", "-n", "-w", key, a.head, "--", *dmap["notice_roots"]],
                                     capture_output=True, text=True).stdout
            except OSError:
                break
            locs = []
            for hit in out.splitlines():
                path, line = hit.split(":", 3)[1:3]  # <head>:<path>:<line>:<text>
                locs.append(f"`{path}:{line}`")
            if locs:
                shown = ", ".join(locs[:5]) + (f" y {len(locs) - 5} más" if len(locs) > 5 else "")
                warns.append(f"este PR cierra {key} y la documentación todavía lo nombra en {shown}: "
                             f"si son avisos `Hoy:`, quitalos en este PR")

    in_gha = os.environ.get("GITHUB_ACTIONS") == "true"
    for w in warns:
        print(f"::warning title=docs-drift::{w}" if in_gha else f"docs-drift ⚠ {w}")
    for n in notes:
        print(f"::notice title=docs-drift::{n}" if in_gha else f"docs-drift · {n}")
    if not warns:
        print("docs-drift ✔ sin drift detectado")

    md = ["### Docs drift (advisory)", ""]
    md += [f"- ⚠️ {w}" for w in warns] + [f"- ℹ️ {n}" for n in notes]
    if not warns and not notes:
        md.append("- ✅ sin drift detectado")
    md.append("")
    md.append("<sub>Aviso, no gate: no bloquea el merge. Mapa: `" + a.map + "`.</sub>")
    text = "\n".join(md) + "\n"
    for target in filter(None, [a.markdown, os.environ.get("GITHUB_STEP_SUMMARY")]):
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
