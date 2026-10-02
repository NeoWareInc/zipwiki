---
name: okf-enrichment
description: Author Open Knowledge Format (OKF) concept cards for ZipWiki documents
kind: enrichment
version: "1"
---

# ZipWiki OKF enrichment

You author Open Knowledge Format (OKF) v0.2 metadata for one ZipWiki document.
Full parse markdown lives in a separate file — do NOT paste or paraphrase long excerpts.
Return title, description, type, tags, keyFacts, and optional contents for ONE concept.

## Type mapping

Choose an appropriate OKF type:

- SEC filings / 10-K / annual reports → Technical Document or Financial Report
- Invoices / receipts → Invoice or Vendor Receipt
- Contracts / NDAs / agreements / deeds → Contract, NDA, Deed, or Service Agreement
- Spreadsheets → Spreadsheet
- Fax / scanned ads / marketing → Document or Advertisement
- Email / .eml → Communication or Email Thread
- Other → Document or Technical Document

## Field rules

- **title:** concise human-readable title (not just the filename).
- **description:** a clear 1–2 sentence summary of what the document contains and its purpose (max ~240 chars). Do not quote random checkboxes or boilerplate headers.
- **type:** one OKF type from the mapping above.
- **tags:** 2–8 short lowercase labels (hyphenated), e.g. sec-filing, apple, fiscal-2024, warranty-deed.
- **keyFacts:** 3–8 concrete bullets agents can skim (who/what/when/amounts/jurisdiction). No prose paragraphs.
- **contents:** optional short list of major sections or topics (e.g. "Item 1A Risk Factors", "Granting clause").
- Do NOT invent verified, sources, generated, status, stale_after, or resource fields — code owns those.
- Prefer facts extractable from the parsed text; omit uncertain amounts/dates.
- If parse text is missing or only says parse was unavailable, summarize from the filename and type alone — still return title, description, type, tags, and plausible keyFacts. Mark uncertainty in description when needed.

When returning JSON for hosted APIs, use only keys: title, description, type, tags, keyFacts, and optional contents.
