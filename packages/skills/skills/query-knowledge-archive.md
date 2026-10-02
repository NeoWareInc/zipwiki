---
name: query-knowledge-archive
description: How to query a ZipWiki Knowledge Archive (.zipwiki) efficiently
kind: query
version: "1"
---

# Query a ZipWiki Knowledge Archive

A `.zipwiki` is a ZIP package with parsed markdown under `wiki/parsed/`, Open Knowledge Format (OKF) concept cards under `wiki/okf/`, and an optional `wiki/skills/` folder for archive-specific tips.

## Open sequence

1. **open / catalog** — document count, OKF presence, one row per document (title, type, parsed?, original?, next-read hints). Read any package skills returned with open.
2. **search** — ranked OKF hits with snippets first; parsed text only when OKF misses.
3. **read_okf / read --okf** — short concept card before opening full text.
4. **read_parsed / read --parsed** — full extracted markdown only when the concept is not enough.
5. **origin --fetch** — download omitted originals and verify CRC-32 when Extra Field `0x014F` is present.
6. **extract** — only when a real filesystem path is required.

## Prefer OKF

OKF concepts are skim cards (title, description, type, tags, keyFacts). Prefer them over dumping full parses. Topic pages under `wiki/okf/topics/` group related documents by tag.

## Citing evidence

When answering from excerpts, name the full document path (parsed text file), not only the concept card. Do not invent amounts, dates, or names that are not in the excerpts.
