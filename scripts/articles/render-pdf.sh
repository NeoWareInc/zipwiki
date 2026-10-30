#!/usr/bin/env bash
# Render articles/{slug}.md → articles/{slug}.pdf via headless Chrome.
# Usage: ./scripts/articles/render-pdf.sh articles/still-just-a-zip.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MD="${1:-}"
if [[ -z "$MD" || ! -f "$MD" ]]; then
  echo "usage: $0 path/to/article.md" >&2
  exit 1
fi
if [[ "$MD" != /* ]]; then
  MD="$ROOT/$MD"
fi

BASENAME="$(basename "$MD" .md)"
DIR="$(cd "$(dirname "$MD")" && pwd)"
OUT="$DIR/$BASENAME.pdf"
HTML="$DIR/.$BASENAME.render.html"
CHROME="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PY="$ROOT/scripts/articles/md_to_html_body.py"

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found at $CHROME (set CHROME_PATH)" >&2
  exit 1
fi

BODY="$(python3 "$PY" "$MD")"
BYLINE="$(
  python3 -c '
import pathlib, re, sys
raw = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r"^byline:\s*[\"'\'']?(.+?)[\"'\'']?\s*$", raw, re.M)
print(m.group(1).strip() if m else "ZipWiki by NeoWare")
' "$MD"
)"
TITLE="$(
  python3 -c '
import pathlib, re, sys
raw = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r"^title:\s*[\"'\'']?(.+?)[\"'\'']?\s*$", raw, re.M)
print(m.group(1).strip() if m else pathlib.Path(sys.argv[1]).stem)
' "$MD"
)"

# Escape for HTML attribute/text in title/byline
TITLE_ESC="$(python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$TITLE")"
BYLINE_ESC="$(python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$BYLINE")"

HEADER_SVG=""
if [[ -f "$DIR/$BASENAME-header.svg" ]]; then
  HEADER_SVG="$DIR/$BASENAME-header.svg"
elif [[ -f "$ROOT/apps/web/public/articles/$BASENAME-header.svg" ]]; then
  HEADER_SVG="$ROOT/apps/web/public/articles/$BASENAME-header.svg"
fi

python3 - "$HTML" "$TITLE_ESC" "$BYLINE_ESC" "$BODY" "$HEADER_SVG" <<'PY'
import pathlib, sys
html_path, title, byline, body, header_svg = sys.argv[1:6]
if header_svg:
    header_uri = pathlib.Path(header_svg).resolve().as_uri()
    header_block = f'<img class="header" src="{header_uri}" alt="{title}" />\n  <p class="byline">{byline}</p>'
else:
    header_block = f'<p class="byline">{byline}</p>\n  <h1>{title}</h1>'
pathlib.Path(html_path).write_text(
    f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    @page {{ margin: 0.65in; size: letter; }}
    body {{
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.48;
      color: #1a1a1a;
      max-width: 7.1in;
      margin: 0 auto;
    }}
    .header {{
      display: block;
      width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 0 0 0.35em;
    }}
    .byline {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      font-weight: 700;
      color: #0d6e6e;
      margin: 0 0 0.75em;
    }}
    h1 {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 18pt;
      font-weight: 700;
      margin: 0 0 0.4em;
      color: #111;
      line-height: 1.25;
    }}
    h2 {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13pt;
      font-weight: 700;
      margin: 1.15em 0 0.4em;
      color: #111;
      page-break-after: avoid;
    }}
    p {{ margin: 0 0 0.7em; }}
    ul, ol {{ margin: 0 0 0.8em; padding-left: 1.25em; }}
    li {{ margin: 0 0 0.35em; }}
    code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9.5pt;
    }}
    pre {{
      background: #f6f6f4;
      border: 1px solid #e2e2de;
      border-radius: 6px;
      padding: 0.75em 1em;
      overflow-x: auto;
      font-size: 9pt;
      line-height: 1.4;
      page-break-inside: avoid;
    }}
    a {{ color: #0d6e6e; text-decoration: underline; }}
    .footer {{
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #777;
      margin-top: 1.25em;
      padding-top: 0.75em;
      border-top: 1px solid #ddd;
    }}
  </style>
</head>
<body>
  {header_block}
  {body}
  <p class="footer">zipwiki.ai · NeoWare, Inc.</p>
</body>
</html>
""",
    encoding="utf-8",
)
PY

"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$HTML"
rm -f "$HTML"
ls -lh "$OUT"
