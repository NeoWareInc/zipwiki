export const SITE_NAME = "ZipWiki";
export const SITE_TAGLINE =
  "A ZIP you can think with—source text as compact markdown for models, indexed for search, readable by the slice.";
export const SITE_DESCRIPTION =
  "ZipWiki turns documents into a portable .zipwiki package that AI can catalog, search, and read selectively—without unpacking the whole archive.";

export const WAITLIST_HREF =
  "mailto:hello@zipwiki.ai?subject=ZipWiki%20waitlist";
export const SALES_HREF =
  "mailto:sales@zipwiki.ai?subject=ZipWiki%20Custom%20plan";

export const NAV = [
  { to: "/product", label: "Product" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/mcp", label: "MCP" },
  { to: "/cli", label: "CLI" },
  { to: "/install", label: "Install" },
  { to: "/pricing", label: "Pricing" },
  { to: "/roadmap", label: "Roadmap" },
] as const;

export const PAGE_TITLES: Record<string, string> = {
  "/": `${SITE_NAME} — ${SITE_TAGLINE}`,
  "/product": `Product — ${SITE_NAME}`,
  "/how-it-works": `How it works — ${SITE_NAME}`,
  "/mcp": `MCP — ${SITE_NAME}`,
  "/cli": `CLI — ${SITE_NAME}`,
  "/install": `Install — ${SITE_NAME}`,
  "/pricing": `Pricing — ${SITE_NAME}`,
  "/roadmap": `Roadmap — ${SITE_NAME}`,
  "/terms": `Terms — ${SITE_NAME}`,
  "/privacy": `Privacy — ${SITE_NAME}`,
};

/** Website outcomes (FEATURES.md). No package paths. */
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

export const HOME_SURFACES = [
  {
    title: "MCP / agents",
    body: "Stdio tools so Cursor, Claude, and other hosts search and read a local .zipwiki without uploading it.",
    to: "/mcp",
    cta: "MCP",
  },
  {
    title: "CLI",
    body: "The same engine for pack, open, search, and scripts—local-first, account optional.",
    to: "/cli",
    cta: "CLI",
  },
  {
    title: "Web portal",
    body: "Account, credits, and human-friendly query. Control plane—not a replacement for the portable file.",
    to: "/product",
    cta: "Product",
  },
] as const;

export const CLASSIC_ZIP_PROBLEM = [
  {
    title: "Classic ZIP",
    body: "Opaque members, find by filename, extract everything to use anything, originals always inflate the package.",
  },
  {
    title: "What agents need",
    body: "Skimmable descriptions, find by meaning, stream compact extracted markdown, optional remote originals when fidelity matters.",
  },
] as const;

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
    body: "Open the catalog, search, read short OKF cards, then stream extracted markdown—and only pull an original or extract to disk when you truly need it.",
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

export const PARSE_PROBLEM = {
  title: "Agents cannot query a folder of real documents",
  lead: "Chat models read text. Most business files are not text. Drop PDFs, scans, or Word files into a chat and the model either skips them, hallucinates from the filename, or burns a context window on garbage. ZipWiki extracts the words into markdown once so every later read is fast and compact.",
} as const;

export const PARSE_FAMILIES = [
  {
    title: "PDFs",
    body: "Native text PDFs become compact markdown locally. Scanned or image-only PDFs need OCR. Dense layouts and forms may use hosted LlamaParse when layout matters.",
  },
  {
    title: "Office (Word, PowerPoint, Pages)",
    body: "Binary Office packages are converted (LibreOffice locally) then extracted into markdown under wiki/parsed/. Without LibreOffice, the original stays and the catalog marks markdown as missing.",
  },
  {
    title: "Spreadsheets",
    body: "Sheets become markdown tables—not a live workbook. Far faster for AI than attaching the binary.",
  },
  {
    title: "Scans and images",
    body: "Images go through OCR into markdown. Extraction is best-effort; OKF still records what the document is so search can find it.",
  },
] as const;

export const PARSE_ENGINES = [
  {
    title: "LiteParse (local, Free)",
    body: "Runs on your machine. Strong on native PDFs and plain text. Office needs LibreOffice. Output is whole-document markdown in wiki/parsed/—what agents actually read.",
  },
  {
    title: "LibreOffice (local helper)",
    body: "Turns Word, Excel, PowerPoint, and similar into something LiteParse can extract. Intermediate conversion PDFs never enter the .zipwiki.",
  },
  {
    title: "LlamaParse (hosted, paid)",
    body: "Multi-format quality or complex layouts. Soft-falls back to LiteParse when credits run out.",
  },
] as const;

export const OKF_INDEXING = {
  title: "OKF is the index. Extracted markdown is the evidence.",
  lead: "Open Knowledge Format (OKF) is a small markdown file per document: YAML frontmatter plus a short body. Search ranks these skims first so the agent does not dump every extracted chapter into context.",
} as const;

export const OKF_FIELDS = [
  {
    title: "Frontmatter the agent searches",
    body: "title, type, tags, and a short description—matched before anyone opens the full extracted markdown.",
  },
  {
    title: "Key facts and sources",
    body: "Facts plus a pointer to the original and wiki/parsed/….md. Stream that markdown only when a quote is needed.",
  },
  {
    title: "wiki/okf/index.md",
    body: "The package index of every concept. Open reports this list—not a raw zip listing of binaries.",
  },
  {
    title: "Who writes OKF",
    body: "On Free, your agent writes OKF with its own LLM after pack. Paid plans can use ZipWiki OKF. Files live in the .zipwiki on disk.",
  },
] as const;

export const HOW_STEPS = [
  {
    title: "Pack",
    prompt:
      "Using ZipWiki, pack ./docs into ./knowledge/docs.zipwiki and enrich every document with AI OKF.",
    detail:
      "Each source’s text is extracted into wiki/parsed/*.md when possible, then given an OKF skim. Optionally attach origin URLs (Extra Field 0x014F).",
  },
  {
    title: "Catalog",
    prompt:
      "Open ./knowledge/docs.zipwiki and tell me what’s inside—titles, types, OKF, extracted markdown, and origin URLs.",
    detail:
      "Each document shows whether it has OKF and extracted markdown, plus the path to read next.",
  },
  {
    title: "Search",
    prompt:
      'Search ./knowledge/docs.zipwiki for a topic and show the top hits with short snippets.',
    detail:
      "OKF ranks first; extracted markdown is a lower-weight backup. Hits return paths and snippets—not full bodies.",
  },
  {
    title: "Read",
    prompt:
      "Read the OKF for one document, then the extracted markdown only if you still need evidence.",
    detail:
      "Keep context small: stream compact .md, not the binary. Extract to disk only when another tool needs a path.",
  },
  {
    title: "Origin",
    prompt:
      "Show the origin URL for a document and fetch it to verify CRC-32.",
    detail:
      "When originals were omitted, origin links + CRC let you pull and verify the authoritative file later.",
  },
] as const;

export const SAMPLE_CATALOG = [
  {
    title: "Policy handbook",
    type: "Policy",
    okf: true,
    parsed: true,
    next: "wiki/okf/… → wiki/parsed/….md",
  },
  {
    title: "Lease agreement",
    type: "Contract",
    okf: true,
    parsed: true,
    next: "wiki/okf/… → wiki/parsed/….md",
  },
  {
    title: "Scanned deed",
    type: "Deed",
    okf: true,
    parsed: false,
    next: "wiki/okf/… (source + origin only)",
  },
] as const;

export const SAMPLE_OKF = `---
title: Example document
type: Policy
tags: [example]
description: Short skim the agent searches first.
sources:
  - wiki/parsed/example.pdf.md
---

Key facts live here. Full evidence is the extracted markdown.`;

export const PLUGIN_BUNDLE = [
  {
    title: "Skills",
    body: "The agent knows when to pack, how to open and search, and how to write OKF enrichment—without you pasting a runbook.",
  },
  {
    title: "MCP server",
    body: "Local stdio tools talk to files on disk. Pack, open, search, read, extract, enrich. Nothing is uploaded unless you use hosted parse.",
  },
  {
    title: "CLI (bundled)",
    body: "The same engine for CI and scripts. Most people never open a terminal.",
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
  "Join the ZipWiki waitlist (downloads and marketplace listings ship when public).",
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
    body: "open / catalog, search, query, read, origin, extract—the same selective-read loop MCP uses.",
  },
  {
    title: "Account",
    body: "login and settings sync to ~/.zipwiki for hosted credits. Local pack does not require an account.",
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
    title: "Pack a folder",
    description: "Create a .zipwiki with OKF enrichment.",
    prompt:
      "Using ZipWiki, pack ./docs into ./knowledge/docs.zipwiki, enrich every document with AI OKF, and tell me the output path.",
  },
  {
    id: "open",
    title: "What’s inside",
    description: "Catalog titles, OKF, extracted markdown, and origins.",
    prompt:
      "Using ZipWiki, open ./knowledge/docs.zipwiki and summarize what’s inside (titles, types, OKF index, extracted markdown, origin URLs).",
  },
  {
    id: "search",
    title: "Search",
    description: "Find documents matching a question.",
    prompt:
      'Using ZipWiki, search ./knowledge/docs.zipwiki for "termination clause" and show the top hits with short snippets.',
  },
  {
    id: "read",
    title: "Read one document",
    description: "Skim OKF first, then extracted markdown if needed.",
    prompt:
      "Using ZipWiki on ./knowledge/docs.zipwiki, read the OKF for the top hit and give a short summary. Read the extracted markdown only if you still need evidence.",
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
      "Buy prepaid credits for hosted LlamaParse and ZipWiki OKF when you need more than the local path. When the balance runs out, packs soft-fall back to Free.",
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
    why: "zipwiki.ai product pages, waitlist, and pricing.",
    status: "Now",
  },
  {
    title: "TypeScript pack, query, MCP",
    why: "The Beta engine. zipwiki pack/open/search/read and stdio MCP anywhere TypeScript runs.",
    status: "Next",
  },
  {
    title: "Cursor marketplace plugin",
    why: "One install that ships skills, MCP, and the CLI together.",
    status: "Next",
  },
  {
    title: "Public downloads",
    why: "Signed installers on the Download page when Beta is ready.",
    status: "Next",
  },
  {
    title: "Hosted API under zipwiki.ai",
    why: "Accounts, keys, and hosted parse.",
    status: "Later",
  },
  {
    title: "Dashboard account plane",
    why: "Keys, usage, billing, settings, and a browser inspector for a local package.",
    status: "Later",
  },
  {
    title: "Rust native CLI",
    why: "Faster native binary for supported OSes; TypeScript stays the everywhere runtime.",
    status: "Later",
  },
  {
    title: "Hosted MCP + saved library",
    why: "Agents that cannot see your disk; optional account-stored packages.",
    status: "Later",
  },
];

export const ADVANCED_CLI = `zipwiki pack ./docs -o knowledge/docs.zipwiki
zipwiki open knowledge/docs.zipwiki
zipwiki search knowledge/docs.zipwiki "termination clause"`;

export const DOWNLOAD_PREREQS = [
  "Node.js 22.13 or newer (TypeScript CLI and MCP runtime).",
  "LibreOffice on the same machine if you pack Word, Excel, or PowerPoint. PDF and text do not need it.",
] as const;
