import { OKF_SPEC_LINK_LABEL, OKF_SPEC_URL } from "./docs-urls";

export { OKF_SPEC_LINK_LABEL, OKF_SPEC_URL };

export const SETTINGS_PAGE = {
  title: "Knowledge Archive settings",
  lead: "You are choosing how ZipWiki builds each Knowledge Archive. These preferences sync to the CLI when you pack.",
} as const;

export const SETTINGS_ONBOARDING_BANNER = {
  body: "Before you enter the portal, confirm how ZipWiki builds Knowledge Archives (defaults are fine). Parse turns documents into markdown; OKF writes a small search index. Save and continue unlocks the rest of the dashboard—you can change these anytime under Settings.",
  howItWorksHref: "/how-it-works",
  howItWorksLabel: "How it works",
} as const;

export const SETTINGS_WHY_PARSE = {
  title: "Why parsing",
  body: "Chat models read text. Most business files are not text—PDFs, Word, slides, and scans are binaries. Parse extracts the words into wiki/parsed/*.md once so every later read is fast and compact. Without parse, agents cannot usefully search those formats.",
} as const;

export const SETTINGS_PARSE_SECTION = {
  title: "1. Parse documents",
  intro:
    "Pick who runs that extraction when you create a Knowledge Archive: ZipWiki LlamaParse (credits), local LiteParse (free on your machine), or your own LlamaParse key under Advanced.",
  billingNote:
    "ZipWiki account uses LlamaParse and prepaid credits. Higher tiers cost more per page (billed with a 20% margin). Default is Cost Effective—the fastest markdown tier. LlamaIndex Turbo is extract-only and is not offered here.",
} as const;

export const SETTINGS_WHY_LLM = {
  title: "Why ZipWiki LLM (OKF index)",
  body: "Filenames are not an index. Open Knowledge Format (OKF) cards—title, type, tags, and key facts—let the agent skim and search before opening full markdown. ZipWiki LLM writes those cards at pack time, or you can skip hosted AI and let your MCP agent enrich later.",
} as const;

export const SETTINGS_LLM_SECTION = {
  title: "2. Build the search index (OKF)",
  intro:
    "Hosted Claude is billed from Anthropic tokens plus a 20% margin (Haiku by default). MCP uses the agent’s own LLM via okf_enrich at no ZipWiki credit cost.",
} as const;

export const SETTINGS_PACK_SECTION = {
  title: "3. Packing options",
  intro:
    "How the .zipwiki file is built: compression, whether to recurse folders, and whether to omit bulky originals after parse (origins stay in Extra Field 0x014F).",
} as const;

export const SETTINGS_CLI_INTRO = {
  lead: "Finish these preferences so zipwiki can download your account settings.",
  whyParse: SETTINGS_WHY_PARSE.body,
  whyLlm: SETTINGS_WHY_LLM.body,
} as const;
