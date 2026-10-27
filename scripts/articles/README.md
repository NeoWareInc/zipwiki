# Article tooling

**Editorial files:** repo-root [`articles/`](../../articles/) — `{slug}.md` + `{slug}.pdf`.

**Website (published only):** `apps/web/src/lib/articles/` modules +
`apps/web/public/articles/` static assets.

## Regenerate a PDF from markdown

```bash
./scripts/articles/render-pdf.sh articles/still-just-a-zip.md
./scripts/articles/render-pdf.sh articles/introducing-zipwiki.md
```

Requires Google Chrome (or set `CHROME_PATH`).

## Legacy intro HTML print

`introducing-zipwiki.html` + `render-introducing-zipwiki-pdf.sh` still write
directly to `apps/web/public/articles/` (site header SVG). Prefer
`render-pdf.sh` + `/articles` for ongoing edits.
