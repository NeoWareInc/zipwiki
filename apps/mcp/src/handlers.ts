/**
 * Shared ZipWiki MCP tool handlers (stdio). Local filesystem / mounted drives only.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  AccessError,
  askArchive,
  DEFAULT_MAX_BYTES,
  enrichOkf,
  extractEntries,
  extractWithOrigin,
  fetchOrigin,
  lookupOrigin,
  listPackage,
  openPackage,
  readEntry as libReadEntry,
  readEntries,
  readManifest as libReadManifest,
  formatReadStdout,
  readOkf as libReadOkf,
  readOkfIndex as libReadOkfIndex,
  readParsed as libReadParsed,
  queryArchive,
  searchPackage,
  updatePackage,
  parseUpdateSpecs,
} from "@zipwiki/zipwiki/access";
import type { OkfEnrichment } from "@zipwiki/zipwiki/okf";
import { runPack } from "@zipwiki/zipwiki";
import {
  loadZipwikiHomeEnv,
  maybeReportActivity,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "@zipwiki/zipwiki/config";
import {
  ChainError,
  chainStatusSummary,
  mintPackage,
  stampPackage,
  upgradePackage,
  verifyPackage,
} from "@zipwiki/zipwiki/chain";
import {
  invalidatePackageCache,
  withCachedPackage,
} from "./package-cache.js";
import {
  isChainPreviewOnly,
  resolveChainPackage,
  resolveChainPreview,
  type ChainAction,
  type McpChainArgs,
} from "./chain-preview.js";
import {
  isPackPreviewOnly,
  resolvePackPlanPreview,
  type McpPackArgs,
} from "./pack-preview.js";

export { DEFAULT_MAX_BYTES };

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function textResult(text: string, isError = false): ToolResult {
  if (isError) {
    return { content: [{ type: "text", text }], isError: true };
  }
  return { content: [{ type: "text", text }] };
}

function jsonResult(value: unknown, isError = false): ToolResult {
  return textResult(JSON.stringify(value, null, 2), isError);
}

function errorResult(err: unknown): ToolResult {
  if (err instanceof AccessError) {
    return jsonResult({ error: err.message, code: err.code }, true);
  }
  const message = err instanceof Error ? err.message : String(err);
  return jsonResult({ error: message, code: "io_error" }, true);
}

/** Offline blockchain status for `open`; null when the package has no proof sidecars. */
async function blockchainStatus(
  packagePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const s = await chainStatusSummary(packagePath);
    if (!s) return null;
    return {
      kind: s.kind,
      status: s.status,
      merkleMatch: s.merkleMatch,
      sidecars: s.sidecars,
      ...(s.status === "merkle-mismatch"
        ? { notice: "content changed since the proof; re-stamp required" }
        : {}),
      ...(s.status === "upgradable" ? { next: "upgrade" } : {}),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function open(args: {
  package?: string;
}): Promise<ToolResult> {
  try {
    const result = withCachedPackage(args.package, () =>
      openPackage(args.package),
    );
    void maybeReportActivity({
      type: "query",
      action: "open",
      path: args.package,
      quiet: true,
    });
    const blockchain = await blockchainStatus(result.package);
    return jsonResult(blockchain ? { ...result, blockchain } : result);
  } catch (err) {
    return errorResult(err);
  }
}

export async function list(args: {
  package?: string;
  prefix?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const result = withCachedPackage(args.package, () => listPackage(args));
    void maybeReportActivity({
      type: "query",
      action: "list",
      path: args.package,
      quiet: true,
    });
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}

export async function search(args: {
  package?: string;
  query: string;
  in?: "okf" | "parsed" | "okf,parsed";
  limit?: number;
  snippetChars?: number;
}): Promise<ToolResult> {
  try {
    if (!args.query?.trim()) {
      return jsonResult(
        { error: "query is required", code: "invalid_args" },
        true,
      );
    }
    const result = withCachedPackage(args.package, () => searchPackage(args));
    void maybeReportActivity({
      type: "query",
      action: "search",
      path: args.package,
      count: Array.isArray((result as { hits?: unknown }).hits)
        ? (result as { hits: unknown[] }).hits.length
        : undefined,
      quiet: true,
    });
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}

export async function query(args: {
  package?: string;
  query: string;
  in?: "okf" | "parsed" | "okf,parsed";
  limit?: number;
  snippetChars?: number;
  readTopK?: number;
  maxBytes?: number;
}): Promise<ToolResult> {
  try {
    if (!args.query?.trim()) {
      return jsonResult(
        { error: "query is required", code: "invalid_args" },
        true,
      );
    }
    const result = withCachedPackage(args.package, () =>
      queryArchive({
        package: args.package,
        query: args.query,
        in: args.in,
        limit: args.limit,
        snippetChars: args.snippetChars,
        readTopK: args.readTopK,
        maxBytes: args.maxBytes,
      }),
    );
    void maybeReportActivity({
      type: "query",
      action: "query",
      path: args.package,
      count: Array.isArray((result as { hits?: unknown }).hits)
        ? (result as { hits: unknown[] }).hits.length
        : undefined,
      quiet: true,
    });
    return jsonResult(result);
  } catch (err) {
    return errorResult(err);
  }
}

export async function ask(args: {
  package?: string;
  question?: string;
  /** Test double. Not an MCP tool field. */
  fetchImpl?: typeof fetch;
  /** When set, credentials come from here and ~/.zipwiki/.env is not loaded. */
  env?: NodeJS.ProcessEnv;
}): Promise<ToolResult> {
  try {
    const question = args.question?.trim() ?? "";
    if (!question) {
      return jsonResult(
        { error: "question is required", code: "invalid_args" },
        true,
      );
    }
    if (!args.env) loadZipwikiHomeEnv();
    const env = args.env ?? process.env;
    const apiUrl = resolveZipwikiApiUrl(env);
    const apiKey = resolveZipwikiApiKey(env);
    if (!apiUrl || !apiKey) {
      return jsonResult(
        {
          error:
            "ZIPWIKI_API_URL and ZIPWIKI_API_KEY are required. Run zipwiki login.",
          code: "invalid_args",
        },
        true,
      );
    }
    const result = await askArchive({
      package: args.package,
      question,
      apiUrl,
      apiKey,
      ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    });
    void maybeReportActivity({
      type: "query",
      action: "ask",
      path: args.package,
      quiet: true,
    });
    return jsonResult({
      answer: result.answer,
      reads: result.reads,
      searches: result.searches,
      sources: result.sources,
      passages: result.passages,
      gaps: result.gaps,
      model: result.model,
      creditsCharged: result.creditsCharged,
      creditsRemaining: result.creditsRemaining,
      creditsUnlimited: result.creditsUnlimited,
    });
  } catch (err) {
    return errorResult(err);
  }
}

export async function readOkfIndex(args: {
  package?: string;
  maxBytes?: number;
  offset?: number;
}): Promise<ToolResult> {
  try {
    return jsonResult(withCachedPackage(args.package, () => libReadOkfIndex(args)));
  } catch (err) {
    return errorResult(err);
  }
}

export async function readOkf(args: {
  package?: string;
  path?: string;
  stem?: string;
  maxBytes?: number;
  offset?: number;
}): Promise<ToolResult> {
  try {
    return jsonResult(withCachedPackage(args.package, () => libReadOkf(args)));
  } catch (err) {
    return errorResult(err);
  }
}

export async function readParsed(args: {
  package?: string;
  path?: string;
  name?: string;
  maxBytes?: number;
  offset?: number;
}): Promise<ToolResult> {
  try {
    return jsonResult(withCachedPackage(args.package, () => libReadParsed(args)));
  } catch (err) {
    return errorResult(err);
  }
}

export async function readEntry(args: {
  package?: string;
  path: string;
  maxBytes?: number;
  offset?: number;
  asBinary?: boolean;
}): Promise<ToolResult> {
  try {
    return jsonResult(withCachedPackage(args.package, () => libReadEntry(args)));
  } catch (err) {
    return errorResult(err);
  }
}

export async function extract(args: {
  package?: string;
  paths?: string[];
  dest?: string;
  overwrite?: boolean;
  fetchOrigin?: boolean;
}): Promise<ToolResult> {
  try {
    const result =
      args.fetchOrigin === true
        ? await extractWithOrigin({ ...args, fetchOrigin: true })
        : withCachedPackage(args.package, () => extractEntries(args));
    return jsonResult({
      ...result,
      note: args.fetchOrigin
        ? "Parsed members extracted; originals fetched from originUri and CRC-checked. Prefer read_parsed + origin (fetch) when you only need the original."
        : "Prefer read to stream bodies over MCP stdio. Extract to disk only when a filesystem path is required.",
    });
  } catch (err) {
    return errorResult(err);
  }
}

export async function origin(args: {
  package?: string;
  path?: string;
  name?: string;
  fetch?: boolean;
  dest?: string;
  overwrite?: boolean;
  maxBytes?: number;
}): Promise<ToolResult> {
  try {
    const selector = args.path ?? args.name;
    if (!selector?.trim()) {
      return jsonResult(
        { error: "path or name is required", code: "invalid_args" },
        true,
      );
    }
    if (args.fetch === true || args.dest) {
      const result = await fetchOrigin({
        package: args.package,
        path: selector,
        dest: args.dest,
        write: Boolean(args.dest),
        overwrite: args.overwrite,
        maxBytes: args.maxBytes,
      });
      return jsonResult(result);
    }
    return jsonResult(
      withCachedPackage(args.package, () =>
        lookupOrigin({ package: args.package, path: selector }),
      ),
    );
  } catch (err) {
    return errorResult(err);
  }
}

export async function read(args: {
  path?: string;
  paths?: string[];
  package?: string;
  maxBytes?: number;
  offset?: number;
  asBinary?: boolean;
}): Promise<ToolResult> {
  try {
    const paths = [
      ...(args.path ? [args.path] : []),
      ...(args.paths ?? []),
    ]
      .map((p) => p.trim())
      .filter(Boolean);
    const results = withCachedPackage(args.package, () =>
      readEntries({
        package: args.package,
        paths,
        maxBytes: args.maxBytes,
        offset: args.offset,
        asBinary: args.asBinary,
      }),
    );
    return textResult(formatReadStdout(results));
  } catch (err) {
    return errorResult(err);
  }
}

export async function readManifest(args: {
  package?: string;
  maxBytes?: number;
}): Promise<ToolResult> {
  try {
    return textResult(
      withCachedPackage(args.package, () =>
        formatReadStdout([
          libReadManifest({ package: args.package, maxBytes: args.maxBytes }),
        ]),
      ),
    );
  } catch (err) {
    return errorResult(err);
  }
}

export async function okfEnrich(args: {
  package?: string;
  path?: string;
  stem?: string;
  primaryPath?: string;
  okfProfile?: "auto" | "book" | "legislation" | "invoice";
  enrichment: OkfEnrichment;
}): Promise<ToolResult> {
  try {
    const result = await enrichOkf({
      package: args.package,
      path: args.path,
      stem: args.stem,
      primaryPath: args.primaryPath,
      okfProfile: args.okfProfile,
      enrichment: args.enrichment,
    });
    invalidatePackageCache(args.package);
    return jsonResult({
      ...result,
      note: "OKF concept written. Call open or search to continue.",
    });
  } catch (err) {
    return errorResult(err);
  }
}

/**
 * Pack sources on the local filesystem (or mounted cloud drive).
 *
 * Default: return a markdown table plan (`displayForUser`) and stop for human chat approval.
 * Pack only when `confirm:true` and `humanApproved:true` after the human said yes in a later message.
 * No MCP elicitation / Approve dialog.
 */
export async function pack(args: McpPackArgs): Promise<ToolResult> {
  try {
    loadZipwikiHomeEnv();
    const preview = resolvePackPlanPreview(args);

    if (isPackPreviewOnly(args)) {
      return jsonResult({
        status: "preview",
        awaitingHumanApproval: true,
        displayForUser: preview.displayForUser,
        cliCommand: preview.cliCommand,
        message: preview.message,
        agentInstruction: preview.agentInstruction,
        plan: preview.plan,
        warnings: preview.warnings,
        suggestedArgs: preview.suggestedArgs,
      });
    }

    if (args.humanApproved !== true) {
      return jsonResult(
        {
          status: "preview",
          awaitingHumanApproval: true,
          code: "pack_needs_human_approval",
          displayForUser: preview.displayForUser,
          cliCommand: preview.cliCommand,
          message: preview.message,
          agentInstruction: preview.agentInstruction,
          plan: preview.plan,
          warnings: preview.warnings,
          suggestedArgs: preview.suggestedArgs,
        },
        true,
      );
    }

    const source = preview.plan.source;
    const outAbs = preview.plan.output;
    await mkdir(resolve(outAbs, ".."), { recursive: true });

    const useZipcodexOkf = preview.suggestedArgs.useZipcodexOkf === true;
    const noAiOkf =
      useZipcodexOkf ? false : (preview.suggestedArgs.noAiOkf ?? false);

    await runPack([source], {
      output: outAbs,
      noAiOkf,
      noOkf: args.noOkf,
      noOcr: args.noOcr,
      recurse: preview.plan.recurse,
      omitOriginalDocuments: preview.plan.omitOriginalDocuments,
      parser: preview.plan.parser,
      parserMode: "fixed",
      parseCredential: preview.plan.parseCredential,
      remoteParse: preview.plan.parseCredential === "zipwiki",
      llamaTier: preview.plan.llamaTier ?? undefined,
      origins: args.origins,
      originPattern: args.originPattern,
      originUrlTemplate: args.originUrlTemplate,
      originFile: args.originFile,
      originDrive: args.originDrive,
      originRecord: args.originRecord,
      sha256Extra: args.sha256Extra,
      originSha256: args.originSha256,
      okfProfile: args.okfProfile,
      yes: true,
      quiet: true,
    });
    if (!existsSync(outAbs)) {
      return jsonResult(
        {
          error: `Pack finished but output missing: ${outAbs}. Check parse credentials (ZIPWIKI_API_KEY or LLAMA_CLOUD_API_KEY).`,
          code: "pack_failed",
        },
        true,
      );
    }

    invalidatePackageCache(outAbs);

    const enrichHint = noAiOkf
      ? "AI OKF was skipped. Read parsed docs with read_parsed, then call okf_enrich with host-LLM enrichment (title, description, type, tags, keyFacts)."
      : "AI OKF ran during pack. Call open on the output.";

    return jsonResult({
      status: "packed",
      output: outAbs,
      source,
      plan: preview.plan,
      noAiOkf,
      useZipcodexOkf,
      enrichHint,
      note:
        "Open with the `open` tool. Free = local LiteParse (LibreOffice needed for Office docs). Paid LlamaParse falls back to LiteParse when quota is exhausted.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /okf_fallback_host_llm/i.test(message)
      ? "okf_fallback_host_llm"
      : /libreoffice|soffice/i.test(message)
        ? "liteparse_dependency"
        : /quota/i.test(message)
          ? "quota_exceeded"
          : /not found/i.test(message)
            ? "not_found"
            : "pack_failed";
    return jsonResult(
      {
        error: message,
        code,
        ...(code === "okf_fallback_host_llm"
          ? {
              hint: "Continue without hosted OKF: call okf_enrich with host-LLM enrichment.",
            }
          : {}),
      },
      true,
    );
  }
}

/**
 * Knowledge-coherent add / update / delete. One rewrite; copies unchanged
 * compressed members. AI OKF skipped by default (same as pack).
 */
export async function update(args: {
  package?: string;
  output?: string;
  add?: string[];
  del?: string[];
  update?: Array<string | { entry: string; file: string }>;
  noAiOkf?: boolean;
  useZipcodexOkf?: boolean;
  noOkf?: boolean;
  noOcr?: boolean;
  omitOriginalDocuments?: boolean;
  includeOriginal?: boolean;
  origins?: string;
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  originRecord?: "manifest" | "cd" | "both";
  sha256Extra?: boolean;
  originSha256?: boolean;
  okfProfile?: "auto" | "book" | "legislation" | "invoice";
}): Promise<ToolResult> {
  try {
    const pkg = args.package?.trim();
    if (!pkg) {
      return jsonResult(
        { error: "package is required", code: "invalid_args" },
        true,
      );
    }
    const zipPath = isAbsolute(pkg) ? pkg : resolve(process.cwd(), pkg);
    const add = (args.add ?? []).map((f) =>
      isAbsolute(f) ? f : resolve(process.cwd(), f),
    );
    const update = (args.update ?? []).map((spec) => {
      if (typeof spec === "string") return parseUpdateSpecs([spec])[0]!;
      return {
        entry: spec.entry,
        file: isAbsolute(spec.file)
          ? spec.file
          : resolve(process.cwd(), spec.file),
      };
    });
    const useZipcodexOkf = args.useZipcodexOkf === true;
    const noAiOkf = useZipcodexOkf ? false : (args.noAiOkf ?? false);
    const omitOriginalDocuments =
      args.includeOriginal === true ? false : args.omitOriginalDocuments;
    const result = await updatePackage({
      package: zipPath,
      output: args.output,
      add,
      del: args.del,
      update,
      noAiOkf,
      noOkf: args.noOkf,
      noOcr: args.noOcr,
      omitOriginalDocuments,
      origins: args.origins,
      originPattern: args.originPattern,
      originUrlTemplate: args.originUrlTemplate,
      originFile: args.originFile,
      originRecord: args.originRecord,
      sha256Extra: args.sha256Extra,
      originSha256: args.originSha256,
      okfProfile: args.okfProfile,
      quiet: true,
    });
    invalidatePackageCache(result.package ?? zipPath);
    return jsonResult({
      ...result,
      noAiOkf,
      note: result.notice
        ? `Call \`open\` next. ${result.notice}. Use the stamp tool to re-stamp. Unchanged members were copied compressed; parse/OKF ran only for add/update.`
        : "Call `open` next. Unchanged members were copied compressed; parse/OKF ran only for add/update.",
    });
  } catch (err) {
    return errorResult(err);
  }
}

/** @deprecated Hosted HTTP MCP helpers — local stdio uses path-based tools. */
export async function openFromBuffer(
  buf: Buffer,
  label: string,
): Promise<ToolResult> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-open-"));
  const zipPath = join(dir, "pkg.zipwiki");
  try {
    await writeFile(zipPath, buf);
    const opened = openPackage(zipPath);
    return jsonResult({ ...opened, package: label });
  } catch (err) {
    return errorResult(err);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function chainErrorResult(err: unknown): ToolResult {
  if (err instanceof ChainError) {
    return jsonResult({ error: err.message, code: err.code }, true);
  }
  return errorResult(err);
}

/** Read-only: verify blockchain sidecars (offline unless `online`). */
export async function verify(args: {
  package?: string;
  online?: boolean;
}): Promise<ToolResult> {
  try {
    loadZipwikiHomeEnv();
    const path = resolveChainPackage(args.package);
    const online = args.online === true;
    const result = await verifyPackage(path, { online });
    return jsonResult({ package: path, online, ...result });
  } catch (err) {
    return chainErrorResult(err);
  }
}

async function chainTool(
  action: ChainAction,
  args: McpChainArgs,
  run: (path: string) => Promise<Record<string, unknown>>,
): Promise<ToolResult> {
  try {
    loadZipwikiHomeEnv();
    const preview = await resolveChainPreview(action, args);
    const previewBody = {
      status: "preview",
      awaitingHumanApproval: true,
      displayForUser: preview.displayForUser,
      cliCommand: preview.cliCommand,
      message: preview.message,
      agentInstruction: preview.agentInstruction,
      plan: preview.plan,
      warnings: preview.warnings,
    };
    if (isChainPreviewOnly(args)) return jsonResult(previewBody);
    if (args.humanApproved !== true) {
      return jsonResult(
        { ...previewBody, code: `${action}_needs_human_approval` },
        true,
      );
    }
    const path = preview.plan.package;
    try {
      const result = await run(path);
      return jsonResult({ package: path, ...result });
    } finally {
      invalidatePackageCache(path);
    }
  } catch (err) {
    return chainErrorResult(err);
  }
}

/** Approval-gated: submit the Merkle root to the Token Service. */
export async function stamp(args: McpChainArgs): Promise<ToolResult> {
  return chainTool("stamp", args, async (path) => {
    const r = await stampPackage(path, {
      email: args.email,
      network: args.network,
      force: args.force === true,
      wait: args.wait === true,
      settings: args.settings,
    });
    return {
      status: "stamped",
      merkleRoot: r.stamp.merkleRoot,
      network: r.settings.network,
      written: r.stamp.written,
      sidecar: "META-INF/TS-SUBMIT.NZIP",
      ...(r.upgrade ? { upgrade: { status: r.upgrade.status } } : {}),
      note: r.upgrade
        ? "Call `verify` to check the proof."
        : "Pending until the batch is on-chain. Call `upgrade` later, then `verify`.",
    };
  });
}

/** Approval-gated: upgrade TS-SUBMIT.NZIP to TIMESTAMP.NZIP. */
export async function upgrade(args: McpChainArgs): Promise<ToolResult> {
  return chainTool("upgrade", args, async (path) => {
    const r = await upgradePackage(path, {
      wait: args.wait === true,
      settings: args.settings,
    });
    return {
      status: r.status,
      merkleRoot: r.merkleRoot,
      note:
        r.status === "pending"
          ? "Not confirmed yet. Try again later."
          : "Call `verify` to check the proof.",
    };
  });
}

/** Approval-gated: mint TOKEN.NZIP (spends gas). Wallet key comes from env only. */
export async function mint(args: McpChainArgs): Promise<ToolResult> {
  return chainTool("mint", args, async (path) => {
    const r = await mintPackage(path, {
      direct: args.direct === true,
      network: args.network,
      settings: args.settings,
    });
    return {
      status: "minted",
      mode: r.mode,
      network: r.network,
      merkleRoot: r.result.merkleRoot,
      sidecar: "META-INF/TOKEN.NZIP",
      note: "Call `verify` (online) to confirm on-chain.",
    };
  });
}
