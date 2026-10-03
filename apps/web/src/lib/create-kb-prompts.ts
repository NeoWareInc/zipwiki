export type ZipWikiPrompt = {
  id: string;
  title: string;
  description: string;
  /** Single-sentence prompt for any agent with ZipWiki MCP. */
  prompt: string;
  /** CLI equivalent for local debugging only (monorepo root). */
  debugCli: string;
};

/** Query an existing .zipwiki — one sentence each. */
export const QUERY_PROMPTS: ZipWikiPrompt[] = [
  {
    id: "open-test1",
    title: "Open office sample",
    description: "Summarize the packed test1 package.",
    prompt:
      "Using ZipWiki MCP, open ./knowledge/test1.zipwiki and summarize the package (manifest, OKF, documents).",
    debugCli: "pnpm zipwiki -- catalog ./knowledge/test1.zipwiki",
  },
  {
    id: "open",
    title: "Open package",
    description: "Summarize what’s inside a .zipwiki.",
    prompt:
      "Using ZipWiki MCP, open ./knowledge/sample-docs.zipwiki and summarize the package (manifest, OKF, documents).",
    debugCli: "pnpm zipwiki -- catalog ./knowledge/sample-docs.zipwiki",
  },
  {
    id: "search",
    title: "Search",
    description: "Find concepts matching a question.",
    prompt:
      'Using ZipWiki MCP, search ./knowledge/sample-docs.zipwiki for "lease" and show the top hits with short snippets.',
    debugCli:
      'pnpm zipwiki -- search ./knowledge/sample-docs.zipwiki "lease"',
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
