# ZipWiki articles (editorial)

Independent of the website. Edit here until an article is ready to publish
on [zipwiki.ai/resources](https://zipwiki.ai/resources).

## Layout

Each article is a pair of files with the same basename:

| File | Role |
| --- | --- |
| `{slug}.md` | Source of truth for editing |
| `{slug}.pdf` | Shareable / downloadable PDF (regenerate after substantive edits) |

Optional assets for a later website publish (headers, OG images) stay under
`apps/web/public/articles/` and are **not** required while drafting here.

## Current articles

| Slug | Status | Title |
| --- | --- | --- |
| `introducing-zipwiki` | Released on site | Introducing ZipWiki: Portable, AI-Searchable Knowledge Packages |
| `still-just-a-zip` | Draft (next blog) | Still Just a ZIP: A Look Inside the .zipwiki Format |

## Editing

1. Edit the `.md` file (YAML frontmatter + markdown body).
2. Regenerate the PDF:

```bash
./scripts/articles/render-pdf.sh articles/still-just-a-zip.md
./scripts/articles/render-pdf.sh articles/introducing-zipwiki.md
```

## Publishing to the website

When ready:

1. Copy `{slug}.pdf` → `apps/web/public/articles/{slug}.pdf` (and add header/OG images if needed).
2. Add or update the TypeScript module under `apps/web/src/lib/articles/` from the markdown (or port sections by hand).
3. List the article in `RESOURCE_ARTICLES` in `apps/web/src/lib/articles/index.ts`.
4. Deploy the web app.

Do **not** put draft copy into `apps/web/src/lib/articles/` until publish week.
