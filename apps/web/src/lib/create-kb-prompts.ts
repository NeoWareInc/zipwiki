export type ZipWikiPrompt = {
  id: string;
  title: string;
  description: string;
  /** Single-sentence prompt for any agent with ZipWiki MCP. */
  prompt: string;
  /** CLI equivalent for local debugging only (monorepo root). */
  debugCli: string;
};

/** Create a .zipwiki — one sentence; agent AI OKF via okf_enrich (MCP). */
export const CREATE_PROMPTS: ZipWikiPrompt[] = [
  {
    id: "test1",
    title: "Office docs (test1)",
    description:
      "Pack knowledge/test1 (Gettysburg and the Bill of Rights) and enrich OKF with the agent LLM.",
    prompt:
      'Using ZipWiki MCP, pack "./knowledge/test1" into ./knowledge/test1.zipwiki, enrich every primary with AI OKF via okf_enrich, and tell me the output path.',
    debugCli:
      "pnpm zipwiki -- pack knowledge/test1 -o ./knowledge/test1.zipwiki --no-ai-okf --parser liteparse",
  },
  {
    id: "sample-docs",
    title: "Mixed docs (test2)",
    description:
      "Pack knowledge/test2 (PDFs, office files, and fax images) and enrich OKF with the agent LLM.",
    prompt:
      'Using ZipWiki MCP, pack "./knowledge/test2" into ./knowledge/sample-docs.zipwiki, enrich every primary with AI OKF via okf_enrich, and tell me the output path.',
    debugCli:
      "pnpm zipwiki -- pack knowledge/test2 -o ./knowledge/sample-docs.zipwiki --no-ai-okf --parser liteparse",
  },
  {
    id: "folder",
    title: "Document folder",
    description: "Pack a folder and enrich OKF — replace the paths first.",
    prompt:
      'Using ZipWiki MCP, pack "./path/to/docs" into ./knowledge/my-docs.zipwiki (recurse if needed), enrich every primary with AI OKF via okf_enrich, and tell me the output path.',
    debugCli:
      "mkdir -p knowledge && pnpm zipwiki -- pack ./path/to/docs -o ./knowledge/my-docs.zipwiki --no-ai-okf -r",
  },
  {
    id: "single-file",
    title: "Single file",
    description: "Pack one file and enrich OKF — replace the paths first.",
    prompt:
      'Using ZipWiki MCP, pack "./path/to/document.pdf" into ./knowledge/document.zipwiki, enrich it with AI OKF via okf_enrich, and tell me the output path.',
    debugCli:
      "mkdir -p knowledge && pnpm zipwiki -- pack ./path/to/document.pdf -o ./knowledge/document.zipwiki --no-ai-okf",
  },
];

/** Query an existing .zipwiki — one sentence each. */
export const QUERY_PROMPTS: ZipWikiPrompt[] = [
  {
    id: "open-test1",
    title: "Open office sample",
    description: "Summarize the packed test1 package.",
    prompt:
      "Using ZipWiki MCP, open ./knowledge/test1.zipwiki and summarize the package (manifest, OKF, primaries).",
    debugCli: "pnpm zipwiki -- list ./knowledge/test1.zipwiki",
  },
  {
    id: "open",
    title: "Open package",
    description: "Summarize what’s inside a .zipwiki.",
    prompt:
      "Using ZipWiki MCP, open ./knowledge/sample-docs.zipwiki and summarize the package (manifest, OKF, primaries).",
    debugCli: "pnpm zipwiki -- list ./knowledge/sample-docs.zipwiki",
  },
  {
    id: "search",
    title: "Search",
    description: "Find concepts matching a question.",
    prompt:
      'Using ZipWiki MCP, search ./knowledge/sample-docs.zipwiki for "lease" and show the top hits with short snippets.',
    debugCli:
      'pnpm zipwiki -- read-manifest -p ./knowledge/sample-docs.zipwiki',
  },
  {
    id: "read-okf",
    title: "Read OKF catalog",
    description: "Browse the concept index / one concept.",
    prompt:
      "Using ZipWiki MCP, read the OKF index for ./knowledge/sample-docs.zipwiki and summarize the concepts.",
    debugCli:
      "pnpm zipwiki -- read -p ./knowledge/sample-docs.zipwiki --path wiki/okf/index.md",
  },
  {
    id: "read-parsed",
    title: "Read parsed text",
    description: "Pull parsed markdown for a document.",
    prompt:
      'Using ZipWiki MCP on ./knowledge/sample-docs.zipwiki, read the parsed text for "property-deed" and give a short summary.',
    debugCli:
      "pnpm zipwiki -- read -p ./knowledge/sample-docs.zipwiki --path wiki/parsed/property-deed.pdf.md",
  },
];
