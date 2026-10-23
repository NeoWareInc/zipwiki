import {
  DOCS_INDEX_URL,
  FORMAT_SPECS_REPO_URL,
  NEOZIP_APPNOTE_SOURCE_URL,
  NEOZIP_APPNOTE_URL,
  OKF_PRODUCER_PROFILE_SOURCE_URL,
  OKF_PRODUCER_PROFILE_URL,
  ZIPWIKI_APPNOTE_SOURCE_URL,
  ZIPWIKI_APPNOTE_URL,
} from "./docs-urls";
import type { AgentPrompt } from "./marketing-copy";

export {
  DOCS_INDEX_URL,
  FORMAT_SPECS_REPO_URL,
  NEOZIP_APPNOTE_SOURCE_URL,
  NEOZIP_APPNOTE_URL,
  OKF_PRODUCER_PROFILE_SOURCE_URL,
  OKF_PRODUCER_PROFILE_URL,
  ZIPWIKI_APPNOTE_SOURCE_URL,
  ZIPWIKI_APPNOTE_URL,
};

export {
  ALL_RESOURCE_ARTICLES,
  RESOURCE_ARTICLES,
  getResourceArticle,
  type ArticleSection,
  type ResourceArticle,
} from "./articles";

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
    ctaLabel: "Read specification →",
    badge: "Specification",
  },
  {
    title: "NeoZip Application Note",
    description:
      "Parent wire-format profile (.nzip) extending PKWARE APPNOTE 6.3.10 with zstd compression, integrity Extra Fields, and reserved namespaces.",
    href: NEOZIP_APPNOTE_URL,
    ctaLabel: "Read NeoZip AppNote →",
    badge: "Wire Format",
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

export const SPEC_COMPARISON_ROWS = [
  {
    document: "ZipWiki Application Note",
    scope: ".zipwiki producer & AI layout profile",
    covers:
      "wiki/parsed/ markdown pairing, wiki/okf/ cards & topics, META-INF/manifest.json ai schema, omit-original policy, Extra Field 0x014F origins, and .zipwiki-notice.md.",
    href: ZIPWIKI_APPNOTE_URL,
    sourceUrl: ZIPWIKI_APPNOTE_SOURCE_URL,
  },
  {
    document: "NeoZip Application Note",
    scope: ".nzip container profile (parent spec)",
    covers:
      "ZIP wire profile extending PKWARE APPNOTE 6.3.10: zstd method 93, Extra Field 0x014E integrity digests, Merkle trees, and META-INF/ reservation.",
    href: NEOZIP_APPNOTE_URL,
    sourceUrl: NEOZIP_APPNOTE_SOURCE_URL,
  },
  {
    document: "ZipWiki OKF Producer Profile",
    scope: "OKF v0.2 subset emitted by ZipWiki",
    covers:
      "Field-by-field matrix comparing general OKF v0.2 bundles with ZipWiki's per-document concept cards and topic rollups.",
    href: OKF_PRODUCER_PROFILE_URL,
    sourceUrl: OKF_PRODUCER_PROFILE_SOURCE_URL,
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
