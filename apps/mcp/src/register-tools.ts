import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  extract,
  list,
  okfEnrich,
  open,
  origin,
  pack,
  update,
  readEntry,
  read,
  readManifest,
  readOkf,
  readOkfIndex,
  readParsed,
  search,
  query,
  type ToolResult,
} from "./handlers.js";

async function respond(
  result: ToolResult,
): Promise<{ content: ToolResult["content"]; isError?: boolean }> {
  return result;
}

const enrichmentSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.string(),
  tags: z.array(z.string()).optional(),
  keyFacts: z.array(z.string()).optional(),
  contents: z.array(z.string()).optional(),
});

const packageArg = z
  .string()
  .optional()
  .describe("Path to .zipwiki (default: wiki.zipwiki in cwd)");

/** Register ZipWiki MCP tools on a server instance (local FS only). */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "open",
    {
      description:
        "Open a local .zipwiki: catalog (one row per primary with OKF title/type, parsed?, original?, next-read hints), manifest summary, and open sequence.",
      inputSchema: {
        package: packageArg,
      },
    },
    async (args) => respond(await open(args)),
  );

  server.registerTool(
    "list",
    {
      description:
        "List entries inside a local .zipwiki (optional prefix filter). Prefer search for Q&A.",
      inputSchema: {
        package: packageArg,
        prefix: z.string().optional().describe("e.g. wiki/okf/"),
        limit: z.number().int().positive().optional(),
      },
    },
    async (args) => respond(await list(args)),
  );

  server.registerTool(
    "search",
    {
      description:
        "Ranked search over OKF concepts (preferred) and optional parsed markdown. Returns paths, snippets, and readHints (e.g. read --okf <stem>).",
      inputSchema: {
        package: packageArg,
        query: z.string().describe("Search query"),
        in: z
          .enum(["okf", "parsed", "okf,parsed"])
          .optional()
          .describe("Default okf,parsed"),
        limit: z.number().int().positive().max(25).optional(),
        snippetChars: z.number().int().positive().optional(),
      },
    },
    async (args) => respond(await search(args)),
  );

  server.registerTool(
    "query",
    {
      description:
        "Search then stream the top-K OKF/parsed bodies (size-capped) in one round-trip. Prefer this when answering a question; use search when you only need paths/snippets.",
      inputSchema: {
        package: packageArg,
        query: z.string().describe("Search query"),
        in: z
          .enum(["okf", "parsed", "okf,parsed"])
          .optional()
          .describe("Default okf,parsed"),
        limit: z.number().int().positive().max(25).optional(),
        snippetChars: z.number().int().positive().optional(),
        readTopK: z
          .number()
          .int()
          .nonnegative()
          .max(10)
          .optional()
          .describe("How many top hits to read in full (default 3)"),
        maxBytes: z.number().int().positive().optional(),
      },
    },
    async (args) => respond(await query(args)),
  );

  server.registerTool(
    "read_okf_index",
    {
      description:
        "Read wiki/okf/index.md when present, otherwise list OKF concept paths.",
      inputSchema: {
        package: packageArg,
        maxBytes: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async (args) => respond(await readOkfIndex(args)),
  );

  server.registerTool(
    "read_okf",
    {
      description:
        "Read one OKF concept markdown file from the package (catalog entry).",
      inputSchema: {
        package: packageArg,
        path: z.string().optional().describe("e.g. wiki/okf/property-deed.md"),
        stem: z.string().optional().describe("Concept stem without path"),
        maxBytes: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async (args) => respond(await readOkf(args)),
  );

  server.registerTool(
    "read_parsed",
    {
      description: "Read a wiki/parsed/*.md document from the package (size-capped). Includes origin (0x014F URI/CRC) when present.",
      inputSchema: {
        package: packageArg,
        path: z.string().optional(),
        name: z.string().optional(),
        maxBytes: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async (args) => respond(await readParsed(args)),
  );

  server.registerTool(
    "read_entry",
    {
      description:
        "Stream any archive entry through MCP (verified inflate; size-capped). UTF-8 text or base64 for binaries. Prefer over extract unless a filesystem path is required.",
      inputSchema: {
        package: packageArg,
        path: z.string().describe("Entry path inside the zip"),
        maxBytes: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        asBinary: z
          .boolean()
          .optional()
          .describe("Force base64 encoding"),
      },
    },
    async (args) => respond(await readEntry(args)),
  );

  server.registerTool(
    "extract",
    {
      description:
        "Verified extract to disk (CRC-32 + SHA-256 when present). Default dest: ~/.zipwiki/extract/<stem>/. Prefer read_* streaming when possible.",
      inputSchema: {
        package: packageArg,
        paths: z
          .array(z.string())
          .optional()
          .describe('Entry paths; omit or ["*"] for all'),
        dest: z.string().optional().describe("Destination directory"),
        overwrite: z.boolean().optional(),
        fetchOrigin: z
          .boolean()
          .optional()
          .describe(
            "Also download Extra Field 0x014F originals next to the extract and verify CRC-32",
          ),
      },
    },
    async (args) => respond(await extract(args)),
  );

  server.registerTool(
    "origin",
    {
      description:
        "Return Extra Field 0x014F origin URI/CRC for a parsed member. Set fetch=true to download the original and verify CRC-32 (and size/SHA-256 when those tags exist). Writes to dest only when dest is set. Prefer this plus read_parsed over dumping original bytes to the LLM.",
      inputSchema: {
        package: packageArg,
        path: z
          .string()
          .optional()
          .describe("Parsed entry, primary path, or wiki/parsed/… name"),
        name: z.string().optional().describe("Alias for path"),
        fetch: z
          .boolean()
          .optional()
          .describe("Download originUri and verify CRC-32"),
        dest: z
          .string()
          .optional()
          .describe("Write the original here (file or directory)"),
        overwrite: z.boolean().optional(),
        maxBytes: z.number().int().positive().optional(),
      },
    },
    async (args) => respond(await origin(args)),
  );

  server.registerTool(
    "read",
    {
      description:
        "Inflate one or more archive entries to the LLM as raw text (verified CRC). One path: body only. Several paths: each wrapped with ===== ZIPWIKI <path> ===== / ===== END <path> =====. Prefer this over extract.",
      inputSchema: {
        package: packageArg,
        path: z.string().optional().describe("Single entry path"),
        paths: z
          .array(z.string())
          .optional()
          .describe("Multiple entry paths (separated in the result)"),
        maxBytes: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        asBinary: z.boolean().optional().describe("Force base64 encoding"),
      },
    },
    async (args) => respond(await read(args)),
  );

  server.registerTool(
    "read_manifest",
    {
      description:
        "Inflate META-INF/manifest.json as raw JSON text (verified CRC). No path argument — always the package manifest.",
      inputSchema: {
        package: packageArg,
        maxBytes: z.number().int().positive().optional(),
      },
    },
    async (args) => respond(await readManifest(args)),
  );

  server.registerTool(
    "pack",
    {
      description:
        "Pack a local file/directory into a .zipwiki. Defaults to noAiOkf so the host LLM can enrich via okf_enrich. Parse may use ZipWiki API (billable) or BYO LlamaParse.",
      inputSchema: {
        source: z.string().describe("File or directory to pack"),
        output: z.string().optional().describe("Output .zipwiki path"),
        noAiOkf: z
          .boolean()
          .optional()
          .describe("Skip AI OKF (default true for MCP)"),
        useZipcodexOkf: z
          .boolean()
          .optional()
          .describe("Optional: run hosted/BYO AI OKF during pack"),
        noOkf: z.boolean().optional(),
        noOcr: z.boolean().optional(),
        recurse: z.boolean().optional(),
        originPattern: z
          .string()
          .optional()
          .describe(
            "Filename regex for Extra Field 0x014F (named groups fill originUrlTemplate)",
          ),
        originUrlTemplate: z
          .string()
          .optional()
          .describe(
            "URI template for omitted originals, e.g. https://host/{year}/{chapter}",
          ),
        originFile: z
          .boolean()
          .optional()
          .describe("Store file: URI on each parse via Extra Field 0x014F"),
        sha256Extra: z
          .boolean()
          .optional()
          .describe(
            "Write Extra Field 0x014E (SHA-256 of each zip member). Default: CRC-32 only",
          ),
        originSha256: z
          .boolean()
          .optional()
          .describe(
            "Include SHA-256 of original primary bytes in Extra Field 0x014F (omit CRC-32)",
          ),
      },
    },
    async (args) => respond(await pack(args)),
  );

  server.registerTool(
    "update",
    {
      description:
        "Add, update, or delete primaries in a local .zipwiki (one full rewrite; copies unchanged compressed members). Parse + optional OKF for add/update; delete drops parse/assets/OKF. AI OKF skipped by default.",
      inputSchema: {
        package: z.string().describe("Path to existing .zipwiki"),
        output: z
          .string()
          .optional()
          .describe("Output path (default: replace package in place)"),
        add: z
          .array(z.string())
          .optional()
          .describe("Local files to add"),
        del: z
          .array(z.string())
          .optional()
          .describe("ZIP paths or unique basenames to delete"),
        update: z
          .array(
            z.union([
              z.string().describe("FILE or ZIPPATH=FILE"),
              z.object({
                entry: z.string(),
                file: z.string(),
              }),
            ]),
          )
          .optional()
          .describe(
            "Update an existing primary from a local file (basename match or ZIPPATH=FILE)",
          ),
        noAiOkf: z
          .boolean()
          .optional()
          .describe("Skip AI OKF (default true for MCP)"),
        useZipcodexOkf: z
          .boolean()
          .optional()
          .describe("Optional: run hosted/BYO AI OKF for add/update"),
        noOkf: z.boolean().optional(),
        noOcr: z.boolean().optional(),
        omitOriginalDocuments: z.boolean().optional(),
        includeOriginal: z
          .boolean()
          .optional()
          .describe("Include original bytes for new/updated files"),
        originPattern: z.string().optional(),
        originUrlTemplate: z.string().optional(),
        originFile: z.boolean().optional(),
        sha256Extra: z
          .boolean()
          .optional()
          .describe(
            "Write Extra Field 0x014E on new members. Default: CRC-32 only",
          ),
        originSha256: z
          .boolean()
          .optional()
          .describe(
            "Include SHA-256 of original primary bytes in Extra Field 0x014F (omit CRC-32)",
          ),
      },
    },
    async (args) => respond(await update(args)),
  );

  server.registerTool(
    "okf_enrich",
    {
      description:
        "Write host-LLM OKF enrichment into a local .zipwiki (title/description/type/tags/keyFacts). No ZipWiki OKF quota.",
      inputSchema: {
        package: packageArg,
        path: z.string().optional().describe("wiki/okf/….md"),
        stem: z.string().optional().describe("Concept stem"),
        primaryPath: z.string().optional().describe("Primary entry path for sources"),
        enrichment: enrichmentSchema,
      },
    },
    async (args) => respond(await okfEnrich(args)),
  );
}
