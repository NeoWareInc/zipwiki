# ZipWiki package

These rules apply to every document in a `.zipwiki` package. A data type in `types/` adds instructions for that kind of file. The model writes one concept card per file. Topic pages are rebuilt from the tags on those cards.

## Prompt

You author Open Knowledge Format (OKF) v0.2 metadata for a ZipWiki document.
Full parse markdown lives in a separate file — do NOT paste or paraphrase long excerpts.
Return title, description, type, tags, keyFacts, and optional contents for ONE concept.

## Rules

- title: concise human-readable title (not just the filename).
- description: a clear 1–2 sentence summary of what the document contains and its purpose (max ~240 chars). Do not quote random checkboxes or boilerplate headers.
- type: {{type}}
- tags: 2–8 short lowercase labels (hyphenated), e.g. sec-filing, apple, fiscal-2024, warranty-deed.
- keyFacts: {{keyFacts}}
- contents: optional short list of major sections or topics (e.g. "Item 1A Risk Factors", "Granting clause").
- Do NOT invent verified, sources, generated, status, stale_after, or resource fields — code owns those.
- Prefer facts extractable from the parsed text; omit uncertain amounts/dates.
{{invent}}
- If parse text is missing or only says parse was unavailable, summarize from the filename and type alone — still return title, description, type, tags, and plausible keyFacts (e.g. format, topic hints from the name). Mark uncertainty in description when needed.

## Invent

- Do not invent amounts, dates, names, or citations that are not in the sample.

## Catalog

A tag becomes `wiki/okf/topics/<tag>.md` when it appears on at least `minimumCards` concept cards. At most `pageCap` pages are kept, most-used tag first. `omitTags` never get a page. `omitSingleFilenameFamily` skips a tag whose cards all share one filename prefix, so one company's ticker does not become a topic while the others do not.

```json
{
  "minimumCards": 2,
  "pageCap": 8,
  "omitTags": ["pdf"],
  "omitSingleFilenameFamily": true
}
```

## Fallback tags

Used when AI OKF is off or a card omits tags. The concept type and the classifier category are always included. Each pattern is tested against the filename.

```json
[
  { "pattern": "\\.(pdf)$", "tags": ["pdf"] },
  { "pattern": "\\.(docx?|odt|rtf)$", "tags": ["word", "office"] },
  { "pattern": "\\.(xlsx|xls|csv)$", "tags": ["spreadsheet"] },
  { "pattern": "\\.(eml|msg)$", "tags": ["email"] },
  { "pattern": "\\.(png|jpe?g|webp|tiff?|gif)$", "tags": ["image", "scan"] },
  { "pattern": "10[-_]?k|sec|edgar", "tags": ["sec-filing"] },
  { "pattern": "deed|contract|nda|agreement", "tags": ["legal"] },
  { "pattern": "invoice|receipt", "tags": ["finance"] }
]
```
