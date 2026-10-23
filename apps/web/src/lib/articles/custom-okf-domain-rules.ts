import type { ResourceArticle } from "./types";

/** Draft — not listed on the public Resources page yet. */
export const customOkfDomainRules: ResourceArticle = {
  slug: "custom-okf-domain-rules",
  title:
    "Customizing OKF Enrichment for Domain Archives: Earnings, Legislation, Books, and Clinical Records",
  excerpt:
    "How developers tailor Open Knowledge Format concept cards, keyFacts, tags, and topic rollup pages for specialized document collections and edge cases.",
  date: "October 22, 2026",
  category: "Developers & Use Cases",
  readTimeMinutes: 8,
  sections: [
    {
      heading: "How ZipWiki shapes OKF concept cards at pack time",
      paragraphs: [
        "Every document in a .zipwiki gets one OKF concept card under wiki/okf/<stem>.md. While generic extraction works out of the box, domain corpora—such as 10-K/10-Q earnings filings, state session laws, novels, or clinical charts—benefit from consistent type labels, domain-specific keyFacts, and curated tag vocabularies.",
        "ZipWiki drives this behavior from markdown rule files in apps/zipwiki/src/lib/okf/rules/: a shared package.md baseline plus per-domain profiles in types/<id>.md.",
      ],
    },
    {
      heading: "Auto-matched and explicit domain profiles (--okf-profile)",
      paragraphs: [
        "Each file in types/<id>.md defines frontmatter that controls how the enrichment model samples the parsed markdown and formats the card:",
      ],
      bullets: [
        "id and okfType — sets the --okf-profile name and the required OKF type field (for example, Financial Report, Legislation, Book, or Invoice).",
        "match — optional filename glob list (such as *-10-k*.pdf,*-10-q*.pdf for earnings or *.epub for books) so mixed folders pick the right profile automatically.",
        "sample: prefix | edges — controls whether the prompt receives the opening of the parsed markdown or both the opening and closing sections (ideal for long books or statutes).",
        "keyFacts and citeSample — instructs the model which 3–8 concrete facts to extract and enforces the non-invention rule so uncertain dates or amounts are never guessed.",
      ],
      code: {
        caption: "Example domain rule — types/earnings.md",
        snippet: `---
id: earnings
okfType: Financial Report
match: "*-10-k*.pdf,*-10-q*.pdf"
sample: prefix
typeRule: Financial Report.
keyFacts: 3–8 concrete bullets from the profile instructions above. No prose paragraphs.
citeSample: true
---

This file is a stock earnings report (SEC Form 10-K or 10-Q). type is Financial Report.
keyFacts are the company name, the ticker, the form, the fiscal year and quarter,
and the period end or filing date when those strings are in the sample.

tags: sec-filing, financial-report, exactly one of 10-k or 10-q,
exactly one of annual-report or quarterly-report, and fyYYYY for the fiscal year.`,
      },
    },
    {
      heading: "Keeping topic rollups clean across multi-entity packages",
      paragraphs: [
        "When multiple concept cards share a tag, ZipWiki builds a rollup page at wiki/okf/topics/<tag>.md. In a multi-company archive (like 28 filings across 7 issuers), naive tagging would create a topic page for one company ticker while skipping others.",
        "The Catalog section in package.md prevents noisy topic pages with four levers: minimumCards (default 2), pageCap (default 8), omitTags (such as bare format labels), and omitSingleFilenameFamily: true, which skips any tag whose cards all share a single filename prefix.",
      ],
    },
    {
      heading: "Handling special archive requirements: notices and origin maps",
      paragraphs: [
        "Special corpora often need package-wide context or custom source routing:",
      ],
      bullets: [
        "Package notices (.zipwiki-notice.md) — place a short notice file in the source folder (up to 500 characters, such as a synthetic-data disclaimer on medical examples). Pack copies it into manifest.json under ai.notice and places it at the top of wiki/okf/index.md before # Files without indexing the notice file as a document.",
        "Per-file and pattern origins (.zipwiki-origins.tsv / .json) — map each filename or regex capture group to its official HTTPS URL so omitted originals remain one command away.",
      ],
    },
  ],
};
