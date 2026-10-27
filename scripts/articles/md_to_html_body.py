#!/usr/bin/env python3
"""Convert article markdown (optional YAML frontmatter) to a simple HTML body."""

from __future__ import annotations

import html
import pathlib
import re
import sys


def strip_frontmatter(raw: str) -> str:
    if not raw.startswith("---"):
        return raw
    end = raw.find("\n---", 3)
    if end == -1:
        return raw
    return raw[end + 4 :].lstrip("\n")


def inline(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<a href="\2">\1</a>',
        s,
    )
    return s


def md_to_html(raw: str) -> str:
    lines = strip_frontmatter(raw).splitlines()
    out: list[str] = []
    in_ul = False
    in_code = False
    code_buf: list[str] = []
    para: list[str] = []
    skipped_h1 = False

    def flush_para() -> None:
        nonlocal para
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []

    for line in lines:
        if in_code:
            if line.strip().startswith("```"):
                out.append(
                    "<pre><code>"
                    + html.escape("\n".join(code_buf))
                    + "</code></pre>"
                )
                code_buf = []
                in_code = False
            else:
                code_buf.append(line)
            continue
        if line.strip().startswith("```"):
            flush_para()
            if in_ul:
                out.append("</ul>")
                in_ul = False
            in_code = True
            continue
        if line.startswith("# "):
            flush_para()
            if in_ul:
                out.append("</ul>")
                in_ul = False
            # First H1 duplicates the title already printed in the template.
            if not skipped_h1:
                skipped_h1 = True
                continue
            out.append(f"<h1>{inline(line[2:].strip())}</h1>")
            continue
        if line.startswith("## "):
            flush_para()
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<h2>{inline(line[3:].strip())}</h2>")
            continue
        if re.match(r"^[-*] ", line):
            flush_para()
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{inline(line[2:].strip())}</li>")
            continue
        if not line.strip():
            flush_para()
            if in_ul:
                out.append("</ul>")
                in_ul = False
            continue
        if in_ul:
            out.append("</ul>")
            in_ul = False
        para.append(line.strip())

    flush_para()
    if in_ul:
        out.append("</ul>")
    return "\n".join(out)


def main() -> None:
    path = pathlib.Path(sys.argv[1])
    sys.stdout.write(md_to_html(path.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
