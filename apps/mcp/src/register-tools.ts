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
  verify,
  stamp,
  upgrade,
  mint,
  readEntry,
  read,
  readManifest,
  readOkf,
  readOkfIndex,
  readParsed,
  ask,
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

const networkArg = z
  .enum(["base-sepolia", "base"])
  .optional()
  .describe("Chain network (default: ~/.zipwiki/chain.json or base-sepolia)");

const confirmArgs = {
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Default false: return a markdown table plan only. true: execute after humanApproved.",
    ),
  humanApproved: z
    .boolean()
    .optional()
    .describe(
      "Set true only after the human approved the table in a later chat message. Required with confirm:true.",
    ),
};

/** Register ZipWiki MCP tools on a server instance (local FS only). */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "open",
    {
      description:
        "Open a local .zipwiki: catalog (one row per input document with OKF title/type, parsed?, original?, next-read hints), manifest summary, and open sequence.",
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
        "Ranked search over OKF concept cards. Parsed markdown is searched only when no OKF card matches, and those hits are marked evidence. Pass in=okf,parsed to search both. Returns paths, snippets, and readHints.",
      inputSchema: {
        package: packageArg,
        query: z.string().describe("Search query"),
        in: z
          .enum(["okf", "parsed", "okf,parsed"])
          .optional()
          .describe("Default okf, with a parsed fallback when OKF misses. okf,parsed searches both."),
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
        "Search, then return the top hit bodies plus local passages from cited wiki/parsed files and stored text primaries. A gap means no extract was stored at pack time: that file's text is not in the package, and read_entry will not recover it. Follow read_parsed only when a parsed path is present and the passage is not enough.",
      inputSchema: {
        package: packageArg,
        query: z.string().describe("Search query"),
        in: z
          .enum(["okf", "parsed", "okf,parsed"])
          .optional()
          .describe("Default okf, with a parsed fallback when OKF misses. okf,parsed searches both."),
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
    "ask",
    {
      description:
        "Ask a question the way the website Query page does. The archive stays local. Matching passages are sent first, then concept cards and gaps. The hosted model may search, read, or request an origin link, then answer. Uses hosted credits (zipwiki login). Prefer search or query when you will read the package yourself.",
      inputSchema: {
        package: packageArg,
        question: z.string().describe("Question to answer from the package"),
      },
    },
    async (args) => respond(await ask(args)),
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
          .describe("Parsed entry, document path, or wiki/parsed/… name"),
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
        "Pack a local file/directory into a .zipwiki. Default: return a markdown table plan (displayForUser) — paste that table into the chat and STOP for the human. After they approve in a later message, call again with confirm:true and humanApproved:true. Do not invent humanApproved in the same turn. Large files + hosted LlamaParse often 413 — prefer parser=liteparse for big PDFs.",
      inputSchema: {
        source: z.string().describe("File or directory to pack"),
        output: z.string().optional().describe("Output .zipwiki path"),
        confirm: z
          .boolean()
          .optional()
          .describe(
            "Default false: show the markdown table plan only. true: pack after humanApproved.",
          ),
        humanApproved: z
          .boolean()
          .optional()
          .describe(
            "Set true only after the human approved the table in a later chat message. Required with confirm:true.",
          ),
        previewOnly: z
          .boolean()
          .optional()
          .describe(
            "Deprecated alias for confirm:false (markdown table plan only).",
          ),
        parser: z
          .enum(["liteparse", "llamaparse"])
          .optional()
          .describe(
            "Document parser. liteparse = local (free). llamaparse = hosted or BYO. Overrides account default for this pack.",
          ),
        parseCredential: z
          .enum(["local", "zipwiki", "llama"])
          .optional()
          .describe(
            "Parse credentials: local (LiteParse), zipwiki (hosted API + credits), llama (LLAMA_CLOUD_API_KEY on this machine).",
          ),
        llamaTier: z
          .string()
          .optional()
          .describe(
            "LlamaParse tier when parser is llamaparse: cost_effective|agentic|agentic_plus|quick",
          ),
        omitOriginal: z
          .boolean()
          .optional()
          .describe(
            "When true, keep only parsed text in the archive (original via origin URI). Default from account settings.",
          ),
        noAiOkf: z
          .boolean()
          .optional()
          .describe("Skip AI OKF during pack (default false)"),
        useZipcodexOkf: z
          .boolean()
          .optional()
          .describe("Optional: run hosted/BYO AI OKF during pack"),
        okfProfile: z
          .enum(["auto", "book", "legislation", "invoice"])
          .optional()
          .describe(
            "OKF profile for every file. auto (default) treats .epub as book. book keyFacts: author, title, date or setting, one distinctive line. legislation: jurisdiction, citation, what it regulates. invoice: vendor, invoice number, date, total. Stored on each manifest primary for okf_enrich.",
          ),
        noOkf: z.boolean().optional(),
        noOcr: z.boolean().optional(),
        recurse: z.boolean().optional(),
        origins: z
          .string()
          .optional()
          .describe(
            "Path to an origins list (JSON entries/rule or TSV file→URL map). Applied as Extra Field 0x014F locators and always excluded from the packed .zipwiki (never stored as a document).",
          ),
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
        originDrive: z
          .boolean()
          .optional()
          .describe(
            "Store each file's Google Drive URL (Drive for desktop) as Extra Field 0x014F",
          ),
        originRecord: z
          .enum(["manifest", "cd", "both"])
          .optional()
          .describe(
            "Where to store origin URI, size, and date. manifest (default) keeps them in META-INF/manifest.json. cd uses Extra Field 0x014F. both writes both copies. CRC-32 stays on 0x014F when the original is omitted or a URI is recorded.",
          ),
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
            "Include SHA-256 of original document bytes in Extra Field 0x014F (omit CRC-32)",
          ),
      },
    },
    async (args) => respond(await pack(args)),
  );

  server.registerTool(
    "update",
    {
      description:
        "Add, update, or delete documents in a local .zipwiki (one full rewrite; copies unchanged compressed members). Parse + optional OKF for add/update; delete drops parse/assets/OKF. AI OKF runs by default; pass noAiOkf true to skip.",
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
            "Update an existing document from a local file (basename match or ZIPPATH=FILE)",
          ),
        noAiOkf: z
          .boolean()
          .optional()
          .describe("Skip AI OKF during add/update (default false)"),
        useZipcodexOkf: z
          .boolean()
          .optional()
          .describe("Optional: run hosted/BYO AI OKF for add/update"),
        okfProfile: z
          .enum(["auto", "book", "legislation", "invoice"])
          .optional()
          .describe(
            "OKF profile for added or updated files. Omit to keep the profile stored on that primary.",
          ),
        noOkf: z.boolean().optional(),
        noOcr: z.boolean().optional(),
        omitOriginalDocuments: z.boolean().optional(),
        includeOriginal: z
          .boolean()
          .optional()
          .describe("Include original bytes for new/updated files"),
        origins: z
          .string()
          .optional()
          .describe(
            "Origins list path (JSON or TSV). Applied for new members; always excluded from packed documents",
          ),
        originPattern: z.string().optional(),
        originUrlTemplate: z.string().optional(),
        originFile: z.boolean().optional(),
        originRecord: z
          .enum(["manifest", "cd", "both"])
          .optional()
          .describe(
            "Where to store origin URI, size, and date: manifest (default), cd, or both",
          ),
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
            "Include SHA-256 of original document bytes in Extra Field 0x014F (omit CRC-32)",
          ),
      },
    },
    async (args) => respond(await update(args)),
  );

  server.registerTool(
    "okf_enrich",
    {
      description:
        "Write host-LLM OKF enrichment into a local .zipwiki (title/description/type/tags/keyFacts). No ZipWiki OKF quota. Follow the profile stored on the manifest primary, or pass okfProfile. book keyFacts: author, title, date or setting, and one distinctive line or scene. legislation: jurisdiction, citation or chapter, and what the section regulates. invoice: vendor, invoice number, date, and total, only when those strings are in the text. Do not invent amounts, dates, names, or citations.",
      inputSchema: {
        package: packageArg,
        path: z.string().optional().describe("wiki/okf/….md"),
        stem: z.string().optional().describe("Concept stem"),
        primaryPath: z
          .string()
          .optional()
          .describe("Input document path for sources"),
        okfProfile: z
          .enum(["auto", "book", "legislation", "invoice"])
          .optional()
          .describe(
            "Profile to store on the primary. Omit to keep the profile chosen at pack.",
          ),
        enrichment: enrichmentSchema,
      },
    },
    async (args) => respond(await okfEnrich(args)),
  );

  server.registerTool(
    "verify",
    {
      description:
        "Read-only: verify blockchain proofs (TS-SUBMIT / TIMESTAMP / TOKEN sidecars) in a local .zipwiki. Offline by default (Merkle binding + embedded proof). Set online:true to ask the Token Service / chain. Returns kind, status, and merkle match.",
      inputSchema: {
        package: packageArg,
        online: z
          .boolean()
          .optional()
          .describe("Contact the Token Service / chain (default false)"),
      },
    },
    async (args) => respond(await verify(args)),
  );

  server.registerTool(
    "stamp",
    {
      description:
        "Submit the package Merkle root to the Token Service (writes META-INF/TS-SUBMIT.NZIP; no document content leaves the machine). Default: return a markdown table plan (displayForUser) — paste it into the chat and STOP for the human. After they approve in a later message, call again with confirm:true and humanApproved:true. Do not invent humanApproved in the same turn. Needs a verified email (arg, NEOZIP_RECIPIENT_EMAIL, or ~/.zipwiki/chain.json).",
      inputSchema: {
        package: packageArg,
        network: networkArg,
        email: z.string().optional().describe("Verified Token Service email"),
        force: z
          .boolean()
          .optional()
          .describe("Re-stamp even if a proof already binds the current content"),
        wait: z
          .boolean()
          .optional()
          .describe("After submit, poll until the timestamp is confirmed"),
        ...confirmArgs,
      },
    },
    async (args) => respond(await stamp(args)),
  );

  server.registerTool(
    "upgrade",
    {
      description:
        "Upgrade a pending stamp (TS-SUBMIT.NZIP) to a confirmed TIMESTAMP.NZIP once the batch is on-chain. Same approval pattern as pack: first call returns displayForUser (paste and STOP); only after the human approves in a later message call again with confirm:true and humanApproved:true.",
      inputSchema: {
        package: packageArg,
        wait: z.boolean().optional().describe("Poll until confirmed (default: single check)"),
        ...confirmArgs,
      },
    },
    async (args) => respond(await upgrade(args)),
  );

  server.registerTool(
    "mint",
    {
      description:
        "Mint an NFT proof and write META-INF/TOKEN.NZIP. SPENDS GAS. Default mints a TimestampProof from a confirmed TIMESTAMP.NZIP; direct:true mints from the wallet. The wallet key is read from ZIPWIKI_WALLET_KEY / NEOZIP_WALLET_PASSKEY in the MCP environment only (never a tool argument). Same approval pattern as pack: first call returns displayForUser (paste and STOP); only after the human approves in a later message call again with confirm:true and humanApproved:true.",
      inputSchema: {
        package: packageArg,
        network: networkArg,
        direct: z
          .boolean()
          .optional()
          .describe("Mint directly from the wallet (no TIMESTAMP.NZIP needed)"),
        ...confirmArgs,
      },
    },
    async (args) => respond(await mint(args)),
  );
}
