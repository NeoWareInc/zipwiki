import { OKF_SPEC_LINK_LABEL, OKF_SPEC_URL } from "./docs-urls";

export { OKF_SPEC_LINK_LABEL, OKF_SPEC_URL };

export const SITE_NAME = "ZipWiki";
export const SITE_TAGLINE = "AI-Searchable Knowledge";
export const SITE_DESCRIPTION =
  "Archival data has to stay small enough to keep and still open when needed. That reader is increasingly an AI agent. A .zipwiki holds compact extracted markdown and an OKF index so an agent can search and read the records a question requires.";

/** Install is last in the marketing menu when true. */
export const SHOW_INSTALL_IN_NAV = true;

const NAV_CORE = [
  { to: "/", label: "Product" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/mcp", label: "MCP & CLI" },
] as const;

const NAV_CONTACT = [{ to: "/contact", label: "Contact" }] as const;

export const NAV = SHOW_INSTALL_IN_NAV
  ? ([...NAV_CORE, { to: "/install", label: "Install" }, ...NAV_CONTACT] as const)
  : ([...NAV_CORE, ...NAV_CONTACT] as const);

export const PAGE_TITLES: Record<string, string> = {
  "/": `${SITE_NAME} — ${SITE_TAGLINE}`,
  "/how-it-works": `How it works — ${SITE_NAME}`,
  "/mcp": `MCP & CLI — ${SITE_NAME}`,
  "/cli": `MCP & CLI — ${SITE_NAME}`,
  "/install": `Install — ${SITE_NAME}`,
  "/contact": `Contact — ${SITE_NAME}`,
  "/download": `Install — ${SITE_NAME}`,
  "/terms": `Terms — ${SITE_NAME}`,
  "/privacy": `Privacy — ${SITE_NAME}`,
};

/** Website outcomes (doc/FEATURES.md "What to emphasize"). No package paths here. */
export const HOME_OUTCOMES = [
  {
    title: "AI can navigate the archive",
    body: "Indexed concepts and package digests—not a blind file list.",
  },
  {
    title: "Models read markdown, not binaries",
    body: "Parsed means extracted markdown text from each source—fast, compact, and easy for AI. Extreme speedup vs feeding PDFs or Office files to the model.",
  },
  {
    title: "Read the slice, not the dump",
    body: "OKF cards first, then compact extracted markdown, then originals only if needed.",
  },
  {
    title: "One portable file",
    body: "Share, sync, and back up like a ZIP. Open with ZipWiki, MCP, or the CLI.",
  },
  {
    title: "Smaller when it matters",
    body: "Omit bulky originals; keep origin links and checksums. Text knowledge from bloated documents often shrinks upwards of 99%—about 1/100th the original size.",
  },
  {
    title: "Evidence stays grounded",
    body: "Answers cite the OKF index and extracted markdown inside the package—not a hosted black box.",
  },
] as const;

export const CLASSIC_ZIP_PROBLEM = [
  {
    title: "Classic ZIP",
    body: "Every original stays in the package. The way in is a filename, then a full extract, so the archive grows with the binaries and still has to be unpacked to read.",
  },
  {
    title: "What agents need",
    body: "A compact text record of each document, search by meaning, and the original only when that record is not enough.",
  },
] as const;

/** doc/FEATURES.md "Differentiating capabilities (today)". */
export const PRODUCT_CAPABILITIES = [
  {
    title: "Extracted markdown for AI",
    body: "“Parsed” is text documentation pulled from each source—sections, tables, OCR when needed. Compact and model-native so agents answer from extracted markdown instead of chewing through binaries. Extreme speedup for models consuming the package.",
  },
  {
    title: "Knowledge index inside the archive (OKF)",
    body: "Open Knowledge Format concept cards and a package index live in the file. Search prefers the OKF index, then the extracted markdown. Indexing travels with the data—no sidecar database to drift.",
  },
  {
    title: "Selective access",
    body: "Open the catalog, search, read short OKF cards, then stream extracted markdown—and only pull an original or extract to disk when you truly need it. Never explode the whole archive into context.",
  },
  {
    title: "Compression through understanding",
    body: "Omit originals and keep verified origin links. Extracted markdown replaces bloated document bytes—typical packs shrink text knowledge upwards of 99%, or about 1/100th the original document size.",
  },
  {
    title: "Package-level AI digest",
    body: "A short package digest summarizes what the archive contains so catalogs, dashboards, and agents know what’s in the box before a deep read.",
  },
  {
    title: "Agent-native surface",
    body: "Local CLI and stdio MCP share one open sequence. Hosted extraction/OKF when credits apply; LiteParse and host-LLM enrichment when offline or quota-limited.",
  },
] as const;

export const TRUST_BULLETS = [
  {
    title: "Standard ZIP",
    body: "Stock unzip still works. Compression defaults to zstd; Deflate or store remain for Info-ZIP interop.",
  },
  {
    title: "Manifest first",
    body: "A package manifest is the discovery file: documents, extraction counts, digest, and whether the OKF index is present.",
  },
  {
    title: "Verified reads",
    body: "Reads check ZIP CRC-32. When stronger digests are present on a member, those are checked too.",
  },
] as const;

export const HOW_IT_WORKS_HERO = {
  title: "Turn files an AI cannot read into a catalog it can search",
  lead: "Pack once: extract compact AI-ready markdown and write an OKF index inside a portable .zipwiki. After that, agents open, search, and read only what they need—without re-parsing binaries or dumping every file into chat. You talk to the agent. The archive stays on disk.",
} as const;

export const CREATE_PACKAGE = {
  title: "When you create a .zipwiki",
  lead: "Two jobs at pack time. Both travel inside the same file so the index cannot drift away from the data.",
  jobs: [
    {
      title: "Extract (parse)",
      body: "Chat models read text. PDFs, Office files, and scans are not. Parse converts each document into markdown under wiki/parsed/ once. Skip it and every chat re-pays binary decode—or the model guesses from filenames.",
    },
    {
      title: "Index (OKF)",
      body: "Parsed markdown is the evidence. Open Knowledge Format (OKF) cards are the index: title, type, tags, and key facts the agent can skim before opening a full chapter. That is indexing as content—not a sidecar vector database that drifts when you copy the file, and not a filename-only ZIP.",
    },
  ],
} as const;

/** Origin locators at pack time — How it works. */
export const ORIGIN_LINKS = {
  title: "Attach an origin link to each document",
  lead: "An origin is the canonical URL (or file path) for the source behind a packed document. When you omit bulky originals from the archive, ZipWiki still records where to fetch them and can verify CRC-32 later. Set origins at pack time—ZipWiki never invents a link.",
  methods: [
    {
      title: "Per-file list (earnings, filings, mixed corpora)",
      body: "When every PDF has its own investor or EDGAR URL—Apple Q2, Microsoft Q2, random company 10-Ks—create a small map next to the folder. Use .zipwiki-origins.tsv (filename, then tab or space, then https URL), .zipwiki-origins.json with an entries object, or pass any list path with --origins. You will often write that list by hand or with a spreadsheet export. Pack always excludes the list file (and *.url / *.origin.json sidecars) so it never becomes a document inside the .zipwiki.",
    },
    {
      title: "Filename pattern (session laws, numbered series)",
      body: "When names share a structure, one rule fills every URL. Example: Ch_2025-001.pdf → https://laws.flrules.org/2025/1 via pattern + urlTemplate in .zipwiki-origins.json, or the same flags on zipwiki pack.",
    },
    {
      title: "Sidecar next to one file",
      body: "For a single override, put Report.pdf.url (one URL per line) or Report.pdf.origin.json beside the document. A sidecar wins over the folder map.",
    },
  ],
  tsvExample: `# file	url
AAPL-2024-Q2.pdf	https://investor.apple.com/example/q2-2024.pdf
MSFT-2024-Q2.pdf	https://www.microsoft.com/example/q2-2024.pdf
ACME-2024-10K.pdf	https://www.sec.gov/example/acme-10k.pdf`,
  jsonExample: `{
  "entries": {
    "AAPL-2024-Q2.pdf": "https://investor.apple.com/example/q2-2024.pdf",
    "MSFT-2024-Q2.pdf": "https://www.microsoft.com/example/q2-2024.pdf",
    "ACME-2024-10K.pdf": "https://www.sec.gov/example/acme-10k.pdf"
  }
}`,
  patternExample: `{
  "pattern": "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
  "urlTemplate": "https://laws.flrules.org/{year}/{chapter}"
}`,
  cliExample: `zipwiki pack ./earnings -o knowledge/earnings.zipwiki \\
  --origins ./earnings/earnings-links.tsv \\
  --omit-original
# --origins list is applied for links and never packed into the .zipwiki.
# Or place .zipwiki-origins.tsv / .json next to the corpus (also auto-excluded).

zipwiki pack ./florida-laws -o knowledge/florida-laws.zipwiki \\
  --origin-pattern 'Ch_(?<year>\\d{4})-(?<chapter>\\d+)' \\
  --origin-url-template 'https://laws.flrules.org/{year}/{chapter}'`,
  agentPrompt:
    "Using ZipWiki, pack ./earnings into ./knowledge/earnings.zipwiki with --origins ./earnings/earnings-links.tsv (one filename and https URL per line). Omit original PDFs from the archive but keep origin links. Do not add the origins list itself as a package document.",
} as const;

export const PARSE_PROBLEM = {
  title: "Why formats need parsing",
  lead: "A Florida session law is a multi-page PDF. A deed is a scan. A lease is a Word file. Drop those into a chat and the model skips them, hallucinates from the filename, or burns context on garbage. ZipWiki extracts the words into markdown once so every later read is fast and compact.",
} as const;

export const PARSE_FAMILIES = [
  {
    title: "PDFs",
    body: "Native text PDFs become compact markdown locally. Scanned or image-only PDFs need OCR. Multi-column 10-Ks, forms, and stamped deeds are the files LiteParse flags as complex—hosted LlamaParse is the upgrade when layout matters.",
  },
  {
    title: "Office (Word, PowerPoint, Pages)",
    body: ".doc, .docx, .ppt, .odt, .rtf, and similar are binary packages, not markdown. Pack converts them through LibreOffice to an intermediate PDF, then extracts text documentation into wiki/parsed/*.md. Without LibreOffice, the original stays in the archive and the catalog marks markdown as missing.",
  },
  {
    title: "Spreadsheets",
    body: ".xlsx, .xls, .csv, Numbers, and ODS become markdown tables—not a live workbook. The agent can read rows and headers. It cannot run formulas. That is still far faster for AI than attaching the binary.",
  },
  {
    title: "Scans and images",
    body: "JPEG, PNG, TIFF, WebP, and SVG go through OCR into markdown. Junk faxes and phone photos of a signed page are the hard case: the original is pixels. Extraction is best-effort; OKF still records what the document is so search can find it.",
  },
] as const;

export const PARSE_ENGINES = [
  {
    title: "LiteParse (local, Free)",
    body: "Runs on your machine. Strong on native PDFs and plain text. Office needs LibreOffice installed. Images use OCR. Unlimited and not billed. Output is whole-document markdown text documentation in wiki/parsed/—what agents actually read.",
  },
  {
    title: "LibreOffice (local helper)",
    body: "Required on the same machine to turn Word, Excel, PowerPoint, and other Office families into something LiteParse can extract. Intermediate conversion PDFs never go into the .zipwiki.",
  },
  {
    title: "LlamaParse (hosted, paid)",
    body: "Used when you want multi-format quality or LiteParse marks a file as complex (dense layout, scans, forms). Soft-falls back to LiteParse when credits run out—not a hard stop.",
  },
] as const;

/** Shown on How it Works near parse / AI sections. */
export const HOW_COMING_SOON =
  "More parsing options and AI options are coming soon.";

export const OKF_INDEXING = {
  title: "OKF is the index. Extracted markdown is the evidence.",
  lead: "Open Knowledge Format (OKF) is a small markdown file per document: YAML frontmatter plus a short body. It is not a vector database. An LLM writes those semantic fields at pack time because filenames cannot. Search ranks these skims first so the agent does not dump every extracted chapter into context.",
} as const;

export const OKF_FIELDS = [
  {
    title: "Frontmatter the agent searches",
    body: "title, type (Session_Law, Statute…), tags, and a short description. Those fields are what “find homestead exemption” matches before anyone opens the full chapter’s extracted markdown.",
  },
  {
    title: "Key facts and sources",
    body: "Parties, dates, amounts, and a pointer back to the original and wiki/parsed/….md file. The agent can answer from facts, then stream that compact markdown only when it needs a quote.",
  },
  {
    title: "wiki/okf/index.md",
    body: "A catalog of every concept in the package. Open the archive and the agent should report this list—not a raw zip listing of binaries.",
  },
  {
    title: "Who writes OKF",
    body: "On Free, the plugin has your agent write OKF with its own LLM after pack. Paid plans can use ZipWiki OKF. Either way the files live in the .zipwiki on disk.",
  },
] as const;

/** Things you ask an AI agent (or CLI) to do on an existing .zipwiki — not a mandatory checklist. */
export const PACKAGE_ACTIONS = {
  title: "What you can do with a package",
  lead: "Once a .zipwiki exists, you do not run a fixed sequence of steps. Ask your AI agent for what you need—or use the same operations from the CLI. Behind the scenes the tools open, search, and read selectively so the whole archive never lands in chat.",
  items: [
    {
      title: "Search by subject or query",
      detail:
        "Find documents that match a topic, phrase, or question. Search prefers the OKF index, then extracted markdown, and returns short hits—not every chapter body.",
      prompt:
        'Using ZipWiki, search ./knowledge/florida-laws.zipwiki for "homestead exemption" and show the top hits with short snippets.',
    },
    {
      title: "Ask a question",
      detail:
        "Get an answer grounded in the package. The agent uses the index and evidence inside the archive instead of guessing from filenames.",
      prompt:
        "Using ZipWiki on ./knowledge/florida-laws.zipwiki, what does Chapter 2025-1 cover? Cite the OKF and only open extracted markdown if you need a quote.",
    },
    {
      title: "See what’s inside",
      detail:
        "Open a catalog of titles, types, whether OKF and extracted markdown exist, and origin links—not a raw zip file listing.",
      prompt:
        "Using ZipWiki, open ./knowledge/florida-laws.zipwiki and summarize what’s inside (titles, types, OKF index, extracted markdown, origin URLs).",
    },
    {
      title: "Read a document’s summary or evidence",
      detail:
        "Skim the OKF card first; stream the compact extracted markdown only when you need detail. Prefer that over dumping the original PDF or Office file.",
      prompt:
        "Using ZipWiki on ./knowledge/florida-laws.zipwiki, read the OKF for Chapter 2025-1 and give a short summary. Read the extracted markdown only if you still need evidence.",
    },
    {
      title: "Extract originals by subject",
      detail:
        "When you need real files on disk—for printing, another tool, or legal fidelity—extract the matching original(s) (or fetch omitted originals via origin) instead of unpacking the whole archive.",
      prompt:
        'Using ZipWiki on ./knowledge/florida-laws.zipwiki, find documents about homestead exemption and extract their original files (or fetch origins) to ./out/homestead/.',
    },
    {
      title: "Verify integrity",
      detail:
        "Confirm the package is well-formed and members check out (ZIP CRC-32). Useful after copy, download, or before you rely on the archive.",
      prompt:
        "Using ZipWiki, test ./knowledge/florida-laws.zipwiki and tell me if the package integrity checks pass.",
    },
    {
      title: "Fetch or verify an origin",
      detail:
        "When originals were omitted at pack time, Extra Field 0x014F can hold a URL. Fetch that origin and verify CRC so you know the remote file still matches.",
      prompt:
        "Using ZipWiki on ./knowledge/florida-laws.zipwiki, show the origin URL for Ch_2025-001 and fetch it to verify CRC-32.",
    },
    {
      title: "Update the archive",
      detail:
        "Add, replace, or remove documents and refresh parse/OKF for what changed—without rebuilding from scratch when you do not need to.",
      prompt:
        "Using ZipWiki, update ./knowledge/florida-laws.zipwiki by adding ./new-laws/Ch_2025-099.pdf and refreshing OKF for that document.",
    },
  ],
} as const;

export const SAMPLE_CATALOG = [
  {
    title: "Chapter 2025-1, Laws of Florida",
    type: "Session_Law",
    okf: true,
    parsed: true,
    next: "wiki/okf/Ch_2025-001.md → laws.flrules.org/2025/1",
  },
  {
    title: "Chapter 2025-42, Laws of Florida",
    type: "Session_Law",
    okf: true,
    parsed: true,
    next: "wiki/okf/Ch_2025-042.md → laws.flrules.org/2025/42",
  },
  {
    title: "Chapter 2024-168, Laws of Florida",
    type: "Session_Law",
    okf: true,
    parsed: true,
    next: "wiki/okf/Ch_2024-168.md → laws.flrules.org/2024/168",
  },
  {
    title: "Chapter 2023-203 (scan)",
    type: "Session_Law",
    okf: true,
    parsed: false,
    next: "wiki/okf/Ch_2023-203.md (source + origin only)",
  },
] as const;

export const SAMPLE_OKF = `---
title: Chapter 2025-1, Laws of Florida
type: Session_Law
tags: [florida, session-law, 2025]
description: First chapter of the 2025 Laws of Florida.
sources:
  - wiki/parsed/Ch_2025-001.pdf.md
origin: https://laws.flrules.org/2025/1
---

Chapter 2025-1. Official text at laws.flrules.org/2025/1.
Filename Ch_2025-001.pdf maps year and chapter onto that URL.`;

export const PLUGIN_BUNDLE = [
  {
    title: "Skills",
    body: "The agent knows when to pack, how to open and search, and how to write OKF enrichment—without you pasting a runbook.",
  },
  {
    title: "MCP server",
    body: "Local stdio tools talk to files on disk (or a mounted drive). Pack, open, search, read, extract, enrich. Nothing is uploaded unless you use hosted parse.",
  },
  {
    title: "CLI (bundled)",
    body: "The same engine for CI and scripts. Most people never open a terminal. The plugin includes the zipwiki command for pack and query.",
  },
] as const;

export const PLUGIN_HOSTS = [
  {
    title: "Cursor",
    body: "Add the ZipWiki plugin from the marketplace. It wires skills, MCP, and the CLI into the project.",
  },
  {
    title: "Claude Code",
    body: "Project MCP config starts the local ZipWiki server. The skill tells Claude the pack and query loop.",
  },
  {
    title: "Claude Desktop",
    body: "Stdio MCP in the desktop config. Same tools, same .zipwiki files on disk.",
  },
] as const;

export const PLUGIN_STEPS = [
  "Install the ZipWiki MCP server for your agent host.",
  "Install the MCP plugin when it is available, then ask your agent to pack a folder or open an existing .zipwiki.",
] as const;

export const MCP_TOOLS_BLURB =
  "Tools follow the open sequence: open, list, search, query, ask, read_okf_index, read_okf, read_parsed, read_entry, read, read_manifest, origin, extract—plus pack, update, and okf_enrich.";

export const CLI_MODES = [
  {
    title: "Create",
    body: "pack, update, and stage/phase workflows. LiteParse locally; optional LlamaParse and AI OKF when logged in with credits.",
  },
  {
    title: "Query",
    body: "open / catalog, search, query, read, read-manifest, origin, extract, test—the same selective-read loop MCP uses.",
  },
  {
    title: "Account",
    body: "login and settings sync to ~/.zipwiki for hosted credits and pack preferences. Local pack does not require an account.",
  },
] as const;

export type AgentPrompt = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

export const AGENT_PROMPTS: AgentPrompt[] = [
  {
    id: "pack",
    title: "Pack Florida session laws",
    description: "Create the sample archive and attach official origin URLs.",
    prompt:
      "Using ZipWiki, pack ./florida-laws into ./knowledge/florida-laws.zipwiki, enrich every document with AI OKF, map Ch_{year}-{chapter}.pdf to https://laws.flrules.org/{year}/{chapter}, and tell me the output path.",
  },
  {
    id: "open",
    title: "What’s inside",
    description: "Catalog titles, types, OKF, extracted markdown, and origins.",
    prompt:
      "Using ZipWiki, open ./knowledge/florida-laws.zipwiki and summarize what’s inside (titles, types, OKF index, extracted markdown, origin URLs).",
  },
  {
    id: "search",
    title: "Search",
    description: "Find chapters matching a question.",
    prompt:
      'Using ZipWiki, search ./knowledge/florida-laws.zipwiki for "homestead exemption" and show the top hits with short snippets.',
  },
  {
    id: "read",
    title: "Read one chapter",
    description: "Skim OKF first, then extracted markdown if needed.",
    prompt:
      "Using ZipWiki on ./knowledge/florida-laws.zipwiki, read the OKF for Chapter 2025-1 and give a short summary. Read the extracted markdown only if you still need evidence.",
  },
  {
    id: "origin",
    title: "Verify the original",
    description: "Fetch the origin URL and check CRC-32.",
    prompt:
      "Using ZipWiki on ./knowledge/florida-laws.zipwiki, show the origin URL for Ch_2025-001 and fetch it to verify CRC-32.",
  },
];

export const ADVANCED_CLI = `zipwiki pack ./florida-laws -o knowledge/florida-laws.zipwiki \\
  --origin-pattern 'Ch_(?<year>\\d{4})-(?<chapter>\\d+)' \\
  --origin-url-template 'https://laws.flrules.org/{year}/{chapter}'
zipwiki open knowledge/florida-laws.zipwiki
zipwiki search knowledge/florida-laws.zipwiki "homestead exemption"`;

export type DownloadPrereq = {
  title: string;
  /** Always-visible one-liner under What you need. */
  blurb: string;
  /** Optional absolute URL for the official installer or docs. */
  docsHref?: string;
  docsLabel?: string;
  installs: readonly { label: string; command: string }[];
};

export const DOWNLOAD_PREREQS: readonly DownloadPrereq[] = [
  {
    title: "Node.js 22.13 or newer",
    blurb: "TypeScript CLI and MCP runtime.",
    docsHref: "https://nodejs.org/",
    docsLabel: "nodejs.org",
    installs: [
      { label: "macOS (Homebrew)", command: "brew install node@22" },
      {
        label: "Linux (NodeSource, Debian/Ubuntu)",
        command:
          "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\nsudo apt-get install -y nodejs",
      },
      {
        label: "Windows (winget)",
        command: "winget install OpenJS.NodeJS.LTS",
      },
    ],
  },
  {
    title: "LibreOffice",
    blurb:
      "On the same machine if you pack Word, Excel, or PowerPoint. PDF and text do not need it.",
    docsHref: "https://www.libreoffice.org/download/",
    docsLabel: "libreoffice.org",
    installs: [
      { label: "macOS (Homebrew)", command: "brew install --cask libreoffice" },
      {
        label: "Linux (Debian/Ubuntu)",
        command: "sudo apt-get install -y libreoffice",
      },
      {
        label: "Windows (Chocolatey)",
        command: "choco install libreoffice-fresh -y",
      },
    ],
  },
];
