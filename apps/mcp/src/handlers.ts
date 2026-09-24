/**
 * Shared ZipWiki MCP tool handlers (stdio). Local filesystem / mounted drives only.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  AccessError,
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
  searchPackage,
  updatePackage,
  parseUpdateSpecs,
  clipUtf8,
} from "@zipwiki/zipwiki/access";
import type { OkfEnrichment } from "@zipwiki/zipwiki/okf";
import {
  listZipEntriesFromBuffer,
  readZipEntryPayload,
} from "@zipwiki/zipwiki/archive";
import { runPack } from "@zipwiki/zipwiki";
import { maybeReportActivity } from "@zipwiki/zipwiki/config";
import {
  invalidatePackageCache,
  withCachedPackage,
} from "./package-cache.js";

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
    return jsonResult(result);
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
    const result = withCachedPackage(args.package, () => {
      const search = searchPackage(args);
      const k = Math.min(
        Math.max(args.readTopK ?? 3, 0),
        search.hits.length,
      );
      const paths = search.hits.slice(0, k).map((h) => h.path);
      const topK =
        paths.length > 0
          ? readEntries({
              package: args.package,
              paths,
              maxBytes: args.maxBytes,
            })
          : [];
      return {
        ...search,
        topK: topK.map((r) => ({
          path: r.path,
          encoding: r.encoding ?? "utf8",
          truncated: r.truncated,
          text: r.text,
          data: r.data,
        })),
      };
    });
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
  enrichment: OkfEnrichment;
}): Promise<ToolResult> {
  try {
    const result = await enrichOkf(args);
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
 * Defaults to skipping ZipWiki AI OKF so the host LLM can enrich via
 * `okf_enrich`. Pass `useZipcodexOkf: true` for hosted/BYO OKF.
 */
export async function pack(args: {
  source: string;
  output?: string;
  /** Default true for MCP — skip hosted AI OKF. */
  noAiOkf?: boolean;
  /** When true, run AI OKF via account credential (ZipWiki or BYO). */
  useZipcodexOkf?: boolean;
  noOkf?: boolean;
  noOcr?: boolean;
  recurse?: boolean;
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  sha256Extra?: boolean;
  originSha256?: boolean;
}): Promise<ToolResult> {
  try {
    const source = isAbsolute(args.source)
      ? args.source
      : resolve(process.cwd(), args.source);
    if (!existsSync(source)) {
      return jsonResult(
        { error: `Source not found: ${source}`, code: "not_found" },
        true,
      );
    }
    const out =
      args.output?.trim() ||
      join(
        await mkdtemp(join(tmpdir(), "zipwiki-mcp-")),
        `${basename(source)}.nzip`,
      );
    const outAbs = isAbsolute(out) ? out : resolve(process.cwd(), out);
    await mkdir(resolve(outAbs, ".."), { recursive: true });

    const useZipcodexOkf = args.useZipcodexOkf === true;
    const noAiOkf = useZipcodexOkf ? false : (args.noAiOkf ?? true);

    await runPack([source], {
      output: outAbs,
      noAiOkf,
      noOkf: args.noOkf,
      noOcr: args.noOcr,
      recurse: args.recurse,
      originPattern: args.originPattern,
      originUrlTemplate: args.originUrlTemplate,
      originFile: args.originFile,
      sha256Extra: args.sha256Extra,
      originSha256: args.originSha256,
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
      ? "AI OKF was skipped (MCP default / Free-path). Read parsed docs with read_parsed, then call okf_enrich with host-LLM enrichment (title, description, type, tags, keyFacts)."
      : "AI OKF ran via account credentials when ZipWiki OKF quota remained. Call open on the output.";

    return jsonResult({
      output: outAbs,
      source,
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
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  sha256Extra?: boolean;
  originSha256?: boolean;
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
    const noAiOkf = useZipcodexOkf ? false : (args.noAiOkf ?? true);
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
      originPattern: args.originPattern,
      originUrlTemplate: args.originUrlTemplate,
      originFile: args.originFile,
      sha256Extra: args.sha256Extra,
      originSha256: args.originSha256,
      quiet: true,
    });
    invalidatePackageCache(result.package ?? zipPath);
    return jsonResult({
      ...result,
      noAiOkf,
      note: "Call `open` next. Unchanged members were copied compressed; parse/OKF ran only for add/update.",
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

/** @deprecated Hosted HTTP MCP helpers. */
export async function readEntryFromBuffer(
  buf: Buffer,
  label: string,
  entryPath: string,
  maxBytes = DEFAULT_MAX_BYTES,
  offset = 0,
): Promise<ToolResult> {
  try {
    const entry = entryPath.replace(/^\/+/, "").replace(/\\/g, "/");
    const entries = listZipEntriesFromBuffer(buf);
    const hit = entries.find((e) => e.name === entry);
    if (!hit) {
      return jsonResult(
        { error: `Entry not found: ${entry}`, code: "not_found" },
        true,
      );
    }
    const clipped = clipUtf8(readZipEntryPayload(buf, hit), maxBytes, offset);
    return jsonResult({
      package: label,
      path: entry,
      truncated: clipped.truncated,
      totalBytes: clipped.totalBytes,
      offset,
      text: clipped.text,
    });
  } catch (err) {
    return errorResult(err);
  }
}
