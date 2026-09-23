export const SITE_NAME = "ZipWiki";
export const SITE_TAGLINE =
  "Give your AI a portable memory of your files.";
export const SITE_DESCRIPTION =
  "Install the ZipWiki plugin. Your agent packs documents into a .zipwiki and can tell you what’s inside—no cloud index required.";

export const WAITLIST_HREF =
  "mailto:hello@zipwiki.ai?subject=ZipWiki%20waitlist";
export const SALES_HREF =
  "mailto:sales@zipwiki.ai?subject=ZipWiki%20Custom%20plan";

export const NAV = [
  { to: "/product", label: "Product" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/roadmap", label: "Roadmap" },
] as const;

export const PAGE_TITLES: Record<string, string> = {
  "/": `${SITE_NAME} — ${SITE_TAGLINE}`,
  "/product": `Product — ${SITE_NAME}`,
  "/how-it-works": `How it works — ${SITE_NAME}`,
  "/pricing": `Pricing — ${SITE_NAME}`,
  "/roadmap": `Roadmap — ${SITE_NAME}`,
  "/terms": `Terms — ${SITE_NAME}`,
  "/privacy": `Privacy — ${SITE_NAME}`,
};

export const AUDIENCES = [
  {
    title: "Anyone in Cursor or Claude",
    body: "Install the plugin. Ask your agent to pack a folder or find a clause. You never have to learn a command line.",
  },
  {
    title: "Operators who keep the files",
    body: "The knowledge base is a .zipwiki you can copy, backup, or unzip. It does not live on our servers.",
  },
  {
    title: "Teams that want hosted parse",
    body: "Free uses local LiteParse and your agent’s LLM. Buy prepaid credits for hosted LlamaParse and ZipWiki OKF — soft fallback when credits run out.",
  },
] as const;

export const PRODUCT_PILLARS = [
  {
    title: "Create",
    ask: "Pack ./florida-laws into knowledge/florida-laws.zipwiki.",
    body: "The agent parses PDFs locally with LiteParse (Office needs LibreOffice on the machine). Credits unlock hosted LlamaParse. OKF concepts come from your agent’s LLM, or ZipWiki OKF when you have credits.",
  },
  {
    title: "Query",
    ask: "What’s in this package? Find homestead exemption.",
    body: "The agent opens the catalog, searches OKF first, then reads wiki/parsed/… only if it needs the body. It extracts to disk only when a real file path is required.",
  },
  {
    title: "Keep it local",
    ask: "The archive stays a file on disk.",
    body: "No cloud index required. Accounts and hosted parse come later. Until then, join the waitlist.",
  },
] as const;

export const TRUST_BULLETS = [
  {
    title: "Standard ZIP",
    body: "Stock unzip still works. Compression defaults to zstd; Deflate or store remain for Info-ZIP interop.",
  },
  {
    title: "Manifest first",
    body: "META-INF/manifest.json is the discovery file: primaries, parse counts, and whether OKF is present.",
  },
  {
    title: "Verified reads",
    body: "Inflate checks ZIP CRC-32. When Extra Field 0x014E or a manifest digest is present, SHA-256 is checked too.",
  },
] as const;

export const PARSE_PROBLEM = {
  title: "Agents cannot query a folder of real documents",
  lead: "Chat models read text. Most business files are not text. A Florida session law is a multi-page PDF on laws.flrules.org. A deed is a scan. A lease is a Word file. Drop those into a chat and the model either skips them, hallucinates from the filename, or burns a context window on garbage.",
} as const;

export const PARSE_FAMILIES = [
  {
    title: "PDFs",
    body: "Native text PDFs become markdown locally. Scanned or image-only PDFs need OCR. Multi-column 10-Ks, forms, and stamped deeds are the files LiteParse flags as complex—hosted LlamaParse is the upgrade when layout matters.",
  },
  {
    title: "Office (Word, PowerPoint, Pages)",
    body: ".doc, .docx, .ppt, .odt, .rtf, and similar are binary packages, not markdown. Local parse converts them through LibreOffice to an intermediate PDF, then extracts text. Without LibreOffice on the machine, the original stays in the archive and the catalog marks it unparsed.",
  },
  {
    title: "Spreadsheets",
    body: ".xlsx, .xls, .csv, Numbers, and ODS become markdown tables—not a live workbook. The agent can read rows and headers. It cannot run formulas. That is still far more queryable than attaching the binary.",
  },
  {
    title: "Scans and images",
    body: "JPEG, PNG, TIFF, WebP, and SVG go through OCR. Junk faxes and phone photos of a signed page are the hard case: the original is pixels. Parse is best-effort; OKF still records what the document is so search can find it.",
  },
] as const;

export const PARSE_ENGINES = [
  {
    title: "LiteParse (local, Free)",
    body: "Runs on your machine. Strong on native PDFs and plain text. Office needs LibreOffice installed. Images use OCR. Unlimited and not billed. Output is whole-document markdown in wiki/parsed/.",
  },
  {
    title: "LibreOffice (local helper)",
    body: "Required on the same machine to turn Word, Excel, PowerPoint, and other Office families into something LiteParse can read. Intermediate conversion PDFs never go into the .zipwiki.",
  },
  {
    title: "LlamaParse (hosted, paid)",
    body: "Used when you want multi-format quality or LiteParse marks a file as complex (dense layout, scans, forms). Soft-falls back to LiteParse when credits run out—not a hard stop.",
  },
] as const;

export const OKF_INDEXING = {
  title: "OKF is the index. Parsed markdown is the evidence.",
  lead: "Open Knowledge Format (OKF) is a small markdown file per document: YAML frontmatter plus a short body. It is not a vector database. Search ranks these skims first so the agent does not dump every parse into context.",
} as const;

export const OKF_FIELDS = [
  {
    title: "Frontmatter the agent searches",
    body: "title, type (Session_Law, Statute…), tags, and a short description. Those fields are what “find homestead exemption” matches before anyone opens the full chapter parse.",
  },
  {
    title: "Key facts and sources",
    body: "Parties, dates, amounts, and a pointer back to the original and wiki/parsed/… file. The agent can answer from facts, then open the parse only when it needs a quote.",
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

export const HOW_STEPS = [
  {
    title: "Pack",
    prompt:
      "Using ZipWiki, pack ./florida-laws into ./knowledge/florida-laws.zipwiki, enrich every document with AI OKF, and map Ch_{year}-{chapter}.pdf origins to https://laws.flrules.org/{year}/{chapter}.",
    detail:
      "Each session-law PDF is parsed to markdown when possible, then given an OKF skim (title, type, tags, key facts). Origin Extra Field 0x014F stores the official laws.flrules.org URL. Hosted OKF is off by default so your agent writes the concepts.",
  },
  {
    title: "Catalog",
    prompt:
      "Open ./knowledge/florida-laws.zipwiki and tell me what’s inside—titles, types, OKF, parsed files, and origin URLs.",
    detail:
      "Each primary shows whether it has OKF and parsed markdown, plus the path the agent will open. Unparsed scans still appear so nothing is silently dropped.",
  },
  {
    title: "Search",
    prompt:
      'Search ./knowledge/florida-laws.zipwiki for "homestead exemption" and show the top hits with short snippets.',
    detail:
      "OKF titles, tags, and descriptions rank first. Parsed text is a lower-weight backup. Hits return paths and snippets—never full chapter bodies.",
  },
  {
    title: "Read",
    prompt:
      "Read the OKF for Chapter 2025-1, then the parsed text only if you still need evidence.",
    detail:
      "Keep context small. Extract to disk only when another tool needs a real path.",
  },
  {
    title: "Origin",
    prompt:
      "On ./knowledge/florida-laws.zipwiki, show the origin URL for Ch_2025-001 and fetch it to verify CRC-32.",
    detail:
      "The parse member carries Extra Field 0x014F. Fetch downloads https://laws.flrules.org/2025/1 and checks CRC-32 (and size or SHA-256 when those tags were written).",
  },
] as const;

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
    body: "Local tools talk to files on disk (or a mounted drive). Pack, open, search, read, extract, enrich. Nothing is uploaded unless you use hosted parse.",
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
  "Join the ZipWiki waitlist (hosted parse and accounts ship after the local loop).",
  "Install the plugin when it is available, then ask your agent to pack a folder or open an existing .zipwiki.",
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
      "Using ZipWiki, pack ./florida-laws into ./knowledge/florida-laws.zipwiki, enrich every primary with AI OKF, map Ch_{year}-{chapter}.pdf to https://laws.flrules.org/{year}/{chapter}, and tell me the output path.",
  },
  {
    id: "open",
    title: "What’s inside",
    description: "Catalog titles, types, OKF, parses, and origins.",
    prompt:
      "Using ZipWiki, open ./knowledge/florida-laws.zipwiki and summarize what’s inside (titles, types, OKF, parsed files, origin URLs).",
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
    description: "Skim OKF first, then parsed text if needed.",
    prompt:
      "Using ZipWiki on ./knowledge/florida-laws.zipwiki, read the OKF for Chapter 2025-1 and give a short summary. Read parsed text only if you still need evidence.",
  },
  {
    id: "origin",
    title: "Verify the original",
    description: "Fetch Extra Field 0x014F and check CRC-32.",
    prompt:
      "Using ZipWiki on ./knowledge/florida-laws.zipwiki, show the origin URL for Ch_2025-001 and fetch it to verify CRC-32.",
  },
];

export const PLANS = [
  {
    slug: "free",
    name: "Free",
    price: "$0",
    blurb:
      "Install the plugin. Pack and search locally with LiteParse. Your agent writes OKF with its own LLM. No account balance required.",
    cta: "Get started",
    href: "/signup",
  },
  {
    slug: "credits",
    name: "Credits",
    price: "From $10",
    blurb:
      "Buy prepaid credits for high-quality hosted parsing and ZipWiki OKF when you need more than the local path. About $10 covers roughly 1,000 pages of high-quality results. When the balance runs out, packs soft-fall back to Free.",
    cta: "Buy credits",
    href: "/dashboard/billing",
  },
] as const;

export type RoadmapStatus = "Now" | "Next" | "Later";

export const ROADMAP: Array<{
  title: string;
  why: string;
  status: RoadmapStatus;
}> = [
  {
    title: "Marketing site",
    why: "zipwiki.ai product pages, waitlist, and pricing. No dashboard.",
    status: "Now",
  },
  {
    title: "TypeScript pack, query, MCP",
    why: "The Beta engine. zipwiki pack, zipwiki open/search/read, and stdio MCP run on Node, agents, and Vercel — anywhere TypeScript runs.",
    status: "Next",
  },
  {
    title: "Cursor marketplace plugin",
    why: "One install that ships skills, MCP, and the CLI together—so marketing matches the box.",
    status: "Next",
  },
  {
    title: "Hosted API under zipwiki.ai",
    why: "api.zipwiki.ai for accounts, keys, and hosted parse. New Fly/Convex/Stripe projects—not zipcodex.ai credentials.",
    status: "Later",
  },
  {
    title: "Dashboard account plane",
    why: "Keys, usage, billing, settings, and a browser inspector for a local package.",
    status: "Later",
  },
  {
    title: "Rust native CLI",
    why: "After TypeScript Beta. A zipwiki binary only on machines we compile for (macOS arm64 first). TypeScript stays the everywhere runtime.",
    status: "Later",
  },
  {
    title: "In-browser pack",
    why: "Create a .zipwiki from the dashboard without opening an agent.",
    status: "Later",
  },
  {
    title: "Richer Knowledge browser",
    why: "Digest cards and the original beside its parse.",
    status: "Later",
  },
  {
    title: "Hosted MCP + saved library",
    why: "Agents that cannot see your disk; optional account-stored packages.",
    status: "Later",
  },
  {
    title: "Connector listings",
    why: "ChatGPT and Claude directory listings—plugin-shaped, not a raw CLI.",
    status: "Later",
  },
  {
    title: "Encryption",
    why: "AES so sensitive archives stay sealed in transit.",
    status: "Later",
  },
  {
    title: "Duplicates and supersession",
    why: "Collapse near-duplicates; mark older docs as superseded.",
    status: "Later",
  },
  {
    title: "Per-page figures and quotes",
    why: "Page-level markdown, extracted figures, bounding-box citations.",
    status: "Later",
  },
  {
    title: "Ingest pipes",
    why: "Watched folder, IMAP, or scanner drop → new .zipwiki.",
    status: "Later",
  },
  {
    title: "Teams and share links",
    why: "Workspaces, revoke-a-link sharing, only if you need multi-user.",
    status: "Later",
  },
];

export const ADVANCED_CLI = `zipwiki pack ./florida-laws -o knowledge/florida-laws.zipwiki \\
  --origin-pattern 'Ch_(?<year>\\d{4})-(?<chapter>\\d+)' \\
  --origin-url-template 'https://laws.flrules.org/{year}/{chapter}'
zipwiki open knowledge/florida-laws.zipwiki
zipwiki search knowledge/florida-laws.zipwiki "homestead exemption"`;
