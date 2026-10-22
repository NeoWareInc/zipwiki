import {
  NEOZIP_APPNOTE_URL,
  OKF_PRODUCER_PROFILE_URL,
  OKF_SPEC_URL,
  ZIPWIKI_APPNOTE_URL,
} from "./docs-urls";
import type { AgentPrompt } from "./marketing-copy";

export {
  NEOZIP_APPNOTE_URL,
  OKF_PRODUCER_PROFILE_URL,
  OKF_SPEC_URL,
  ZIPWIKI_APPNOTE_URL,
};

export const RESOURCES_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "articles", label: "Articles" },
  { id: "appnote", label: "App Note & Specs" },
  { id: "developers", label: "Developer Use Cases" },
] as const;

export type ResourceCardItem = {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  badge: string;
  external?: boolean;
};

export const RESOURCE_CARDS: readonly ResourceCardItem[] = [
  {
    title: "Articles & Guides",
    description:
      "Deep dives into portable .zipwiki packages, selective AI retrieval, and practical guides for archiving documents.",
    href: "#articles",
    ctaLabel: "Read articles →",
    badge: "Articles",
  },
  {
    title: "ZipWiki Application Note",
    description:
      "Producer and layout profile for .zipwiki — META-INF/manifest.json, wiki/parsed/, wiki/okf/, omit-original policy, and Extra Field 0x014F.",
    href: ZIPWIKI_APPNOTE_URL,
    ctaLabel: "Open specification →",
    badge: "Specification",
    external: true,
  },
  {
    title: "NeoZip Application Note",
    description:
      "Parent wire-format profile (.nzip) extending PKWARE APPNOTE 6.3.10 with zstd compression, integrity Extra Fields, and reserved namespaces.",
    href: NEOZIP_APPNOTE_URL,
    ctaLabel: "Open NeoZip AppNote →",
    badge: "Wire Format",
    external: true,
  },
  {
    title: "Open Knowledge Format (OKF v0.2)",
    description:
      "Semantic concept cards, YAML frontmatter fields, key facts, and topic rollup pages stored inside wiki/okf/.",
    href: OKF_SPEC_URL,
    ctaLabel: "Open OKF v0.2 spec →",
    badge: "Language Spec",
    external: true,
  },
  {
    title: "Developers & Special Use Cases",
    description:
      "Domain OKF profiles (--okf-profile), custom types/<id>.md rules, topic rollup controls, origin maps, and package notices.",
    href: "#developers",
    ctaLabel: "Explore guides →",
    badge: "Developers",
  },
  {
    title: "MCP & CLI Integration",
    description:
      "Connect Claude Code, Cursor, or your scripts to local .zipwiki archives using the shared open -> search -> read workflow.",
    href: "/mcp",
    ctaLabel: "View MCP & CLI →",
    badge: "Tools",
  },
];

export type ArticleSection = {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  code?: {
    caption: string;
    snippet: string;
  };
};

export type ResourceArticle = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTimeMinutes: number;
  sections: readonly ArticleSection[];
};

export const RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  {
    slug: "introducing-zipwiki",
    title:
      "Introducing ZipWiki: Portable, AI-Searchable Knowledge Packages",
    excerpt:
      "How pairing compressed document storage with extracted markdown and an embedded OKF index lets AI agents query archives selectively—while shrinking text knowledge to roughly 1/100th the original size.",
    date: "October 18, 2026",
    category: "Product & Architecture",
    readTimeMinutes: 6,
    sections: [
      {
        heading: "Why long-term document archives need an AI-native layout",
        paragraphs: [
          "Every team accumulates folders of PDFs, Word documents, spreadsheets, slide decks, and scans—session laws, quarterly earnings filings, clinical records, contracts, or reference books. Traditional ZIP archives keep every binary intact and compact on disk, yet an AI agent can only see filenames until someone unpacks and re-parses the entire archive.",
          "ZipWiki solves both sides of the archival problem at once. When you pack a folder into a .zipwiki file, ZipWiki extracts clean markdown from each source document once and writes an Open Knowledge Format (OKF) index directly inside the same standard ZIP container.",
        ],
      },
      {
        heading: "What lives inside a .zipwiki package",
        paragraphs: [
          "A .zipwiki is a valid ZIP archive (defaulting to zstd compression) organized around two reserved trees so metadata, AI evidence, and optional primary files stay cleanly separated:",
        ],
        bullets: [
          "META-INF/manifest.json — the package discovery file listing document counts, parser provenance, the package-level AI digest, optional package notice, and OKF index location.",
          "wiki/okf/ — one lightweight OKF concept card per document (YAML frontmatter + key facts and contents), wiki/okf/index.md for catalog discovery, and wiki/okf/topics/*.md rollup pages.",
          "wiki/parsed/ — compact extracted markdown for each source document so models read structured text rather than binary streams.",
          "Primary originals (optional) — stored in the archive when needed, or omitted with --omit-original while preserving verified origin URLs and CRC-32 checksums in Extra Field 0x014F.",
        ],
        code: {
          caption: "Selective open sequence shared by ZipWiki MCP and CLI",
          snippet: `1. open     -> Read META-INF/manifest.json and wiki/okf/index.md
2. search   -> Rank OKF concept cards first, then extracted markdown
3. read     -> Inspect the matching OKF card, then stream only the needed markdown slice
4. origin   -> Fetch or verify omitted originals via Extra Field 0x014F when required`,
        },
      },
      {
        heading: "Compression through understanding",
        paragraphs: [
          "Because extracted markdown captures the text, tables, and headings an LLM actually reads, bulky PDFs can stay at their canonical origin URLs (such as state law portals or SEC EDGAR). Omitting originals while keeping verified origin links routinely shrinks text knowledge upwards of 99%—around 1/100th of the source corpus size—while keeping every citation verifiable.",
          "When fidelity requires the original bytes inside the file (for example, clinical packets or offline legal bundles), pass --include-original and ZipWiki stores both the primary binary and its pre-indexed markdown side by side.",
        ],
      },
    ],
  },
  {
    slug: "inside-the-zipwiki-appnote",
    title:
      "Inside the ZipWiki Application Note: How .zipwiki Extends NeoZip and PKWARE APPNOTE",
    excerpt:
      "A technical tour of the ZipWiki Application Note (0.2.0-draft): reserved namespaces, manifest.json ai schemas, Extra Field 0x014F origin locators, and strict ZIP compatibility.",
    date: "October 20, 2026",
    category: "Specification",
    readTimeMinutes: 7,
    sections: [
      {
        heading: "Layered on PKWARE APPNOTE 6.3.10 and NeoZip 0.2",
        paragraphs: [
          "The ZipWiki Application Note defines how zipwiki writes—and how zipaccess and MCP tools read—AI knowledge materials inside a NeoZip container. Every .zipwiki file is a compliant ZIP archive per PKWARE APPNOTE 6.3.10 and a valid NeoZip profile archive.",
          "Stock unzip tools can list and extract a .zipwiki without special plugins. Readers that do not recognize ZipWiki's extra fields or META-INF/manifest.json simply ignore them per APPNOTE §4.5 and §4.6.",
        ],
      },
      {
        heading: "Two reserved namespaces: META-INF/ and wiki/",
        paragraphs: [
          "Rather than scattering sidecar files alongside user documents, the Application Note reserves two top-level namespaces:",
        ],
        bullets: [
          "META-INF/ holds package-level control metadata, starting with META-INF/manifest.json (format: \"neozip\", specVersion: \"0.2\", and the ai registry).",
          "wiki/ (the default AI root) holds all generated knowledge artifacts: wiki/parsed/<relpath>.md for extracted document text and wiki/okf/ for Open Knowledge Format cards and topic pages.",
          "Clean index invariant: ZipWiki writes markdown concept cards, wiki/okf/index.md, and multi-card topic pages under wiki/okf/topics/, keeping the archive free of redundant search blobs or execution logs.",
        ],
        code: {
          caption: "META-INF/manifest.json — ai object excerpt",
          snippet: `{
  "format": "neozip",
  "specVersion": "0.2",
  "ai": {
    "root": "wiki",
    "documents": 28,
    "parsed": 28,
    "digest": "28 documents: 2025 SEC Form 10-K and Form 10-Q filings across seven public companies...",
    "okf": {
      "version": "0.2",
      "index": "wiki/okf/index.md",
      "concepts": 28
    }
  }
}`,
        },
      },
      {
        heading: "Extra Field 0x014F: Origin links and CRC-32 verification",
        paragraphs: [
          "When an archive is packed with --omit-original, each document's central directory record and OKF card can carry its canonical source URL alongside the original file's CRC-32 and uncompressed size.",
          "At query or extract time, zipwiki origin --fetch downloads the remote file and checks its CRC-32 against the recorded checksum, proving that the external PDF or document matches the exact bytes that were parsed at pack time.",
        ],
      },
    ],
  },
  {
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
  },
];

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((article) => article.slug === slug);
}

export const SPEC_COMPARISON_ROWS = [
  {
    document: "ZipWiki Application Note",
    scope: ".zipwiki producer & AI layout profile",
    covers:
      "wiki/parsed/ markdown pairing, wiki/okf/ cards & topics, META-INF/manifest.json ai schema, omit-original policy, Extra Field 0x014F origins, and .zipwiki-notice.md.",
    href: ZIPWIKI_APPNOTE_URL,
  },
  {
    document: "NeoZip Application Note",
    scope: ".nzip container profile (parent spec)",
    covers:
      "ZIP wire profile extending PKWARE APPNOTE 6.3.10: zstd method 93, Extra Field 0x014E integrity digests, Merkle trees, and META-INF/ reservation.",
    href: NEOZIP_APPNOTE_URL,
  },
  {
    document: "Open Knowledge Format (OKF v0.2)",
    scope: "Concept & index markdown specification",
    covers:
      "YAML frontmatter schema (type, title, description, tags, sources, origin), index.md catalog rules, and topic pages.",
    href: OKF_SPEC_URL,
  },
  {
    document: "ZipWiki OKF Producer Profile",
    scope: "OKF v0.2 subset emitted by ZipWiki",
    covers:
      "Field-by-field matrix comparing general OKF v0.2 bundles with ZipWiki's per-document concept cards and topic rollups.",
    href: OKF_PRODUCER_PROFILE_URL,
  },
] as const;

export const DEVELOPER_USE_CASE_CARDS = [
  {
    title: "Domain OKF profiles (--okf-profile)",
    body: "Tailor concept card type, keyFacts bullets, sampling window (prefix vs edges), and tag rules for SEC filings, session laws, books, invoices, or your own document class.",
  },
  {
    title: "Balanced topic rollups",
    body: "Control wiki/okf/topics/*.md generation with minimumCards, pageCap, omitTags, and omitSingleFilenameFamily so topic pages reflect cross-cutting themes rather than a single file prefix.",
  },
  {
    title: "Package notices (.zipwiki-notice.md)",
    body: "Embed a corpus-wide disclaimer, synthetic-patient notice, or handling instruction into ai.notice and the top of wiki/okf/index.md without turning the notice into a searchable document.",
  },
  {
    title: "Omitted originals + verified origins",
    body: "Pair --omit-original with .zipwiki-origins.tsv or regex URL templates. Agents query the compact markdown locally and fetch + CRC-verify the original PDF only when needed.",
  },
] as const;

export const DEVELOPER_OKF_TABS = [
  {
    label: "Custom profile (types/<id>.md)",
    caption: "Define a domain OKF profile for clinical, legal, or technical corpora",
    code: `---
id: clinical-chart
okfType: Clinical Record
match: "*-consult*.pdf,*-hospice*.pdf,*-imaging*.pdf"
sample: prefix
typeRule: Clinical Record.
keyFacts: 3–8 concrete bullets from the profile instructions above. No prose paragraphs.
citeSample: true
---

This file is a clinical record (history & physical, imaging study, consult, or hospice note).
type is Clinical Record. keyFacts are the document kind, encounter date, care setting,
and primary documented findings when present in the sample.

tags: clinical-record, plus 2–5 lowercase specialty or setting tags (e.g. hospice, imaging, cardiology).`,
  },
  {
    label: "Earnings rule (types/earnings.md)",
    caption: "Built-in profile for SEC Form 10-K and 10-Q filings",
    code: `---
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

tags: sec-filing, financial-report, 10-k or 10-q, annual-report or quarterly-report, and fyYYYY.`,
  },
  {
    label: "Topic catalog (package.md)",
    caption: "Keep wiki/okf/topics/*.md clean across multi-company archives",
    code: `## Catalog

A tag becomes \`wiki/okf/topics/<tag>.md\` when it appears on at least \`minimumCards\`
concept cards. \`omitSingleFilenameFamily\` skips a tag whose cards all share one
filename prefix, so one company's ticker does not become a topic while others do not.

\`\`\`json
{
  "minimumCards": 2,
  "pageCap": 8,
  "omitTags": ["pdf"],
  "omitSingleFilenameFamily": true
}
\`\`\``,
  },
  {
    label: "Notice & Origins sidecars",
    caption: "Add a package notice and origin map in the source folder before packing",
    code: `# 1. Optional package-level notice (.zipwiki-notice.md, max 500 chars)
echo "These are not real patients. All names, results, and symptoms are made up for example purposes." \\
  > ./medical-folder/.zipwiki-notice.md

# 2. Optional origin links (.zipwiki-origins.tsv)
printf "AAPL-2025-10-K.pdf\\thttps://www.sec.gov/ix?doc=/Archives/edgar/data/...\\n" \\
  > ./earnings-folder/.zipwiki-origins.tsv

# 3. Pack with an explicit OKF profile
zipwiki pack ./earnings-folder -o ./knowledge/earnings-2025.zipwiki \\
  --okf-profile earnings --omit-original`,
  },
] as const;

export const DEVELOPER_PROMPTS: readonly AgentPrompt[] = [
  {
    id: "dev-pack-earnings",
    title: "Pack with a domain OKF profile",
    description: "Use the earnings profile and omit original PDFs while keeping SEC links.",
    prompt:
      "Pack ./earnings-2025 into ./knowledge/earnings-2025.zipwiki with --okf-profile earnings and --omit-original.",
  },
  {
    id: "dev-pack-notice",
    title: "Pack with a disclaimer notice",
    description: "Include a .zipwiki-notice.md banner in manifest.json and wiki/okf/index.md.",
    prompt:
      "Add a .zipwiki-notice.md disclaimer to ./medical-pdfs and pack the folder into ./knowledge/medical-pdfs.zipwiki.",
  },
];
