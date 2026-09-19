/**
 * Extra Field 0x014F original locators: look up URI/CRC, fetch bytes, verify.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLE_PATHS,
  listZipEntries,
  originCrc32FromApi,
  originCrc32Hex,
  originCrc32Of,
  pickOriginApiFields,
  useZipHandle,
  type OriginApiFields,
  type ZipListEntry,
} from "../archive/index.js";
import { extractEntries, defaultExtractRoot } from "./extract.js";
import {
  AccessError,
  normalizeEntryName,
  resolvePackagePath,
} from "./resolve.js";

/** Cap on downloaded original bytes (not the parse markdown). */
export const DEFAULT_MAX_ORIGIN_BYTES = 64 * 1024 * 1024;

export type OriginSummary = {
  parsedPath: string;
  primaryPath: string;
} & OriginApiFields;

export type OriginCheck = {
  expected?: string | number;
  actual: string | number;
  matched?: boolean;
};

export type OriginFetchResult = OriginSummary & {
  package: string;
  originUri: string;
  bytes: number;
  crc32: OriginCheck;
  sha256?: OriginCheck;
  size?: OriginCheck;
  /** Set when the original was written to disk. */
  path?: string;
  /** True when every tag that was present (CRC / size / SHA-256) matched. */
  verified: boolean;
};

export function entryHasOrigin(e: ZipListEntry): boolean {
  return (
    e.originUri !== undefined ||
    e.originCrc32 !== undefined ||
    e.originSize !== undefined ||
    e.originMtime !== undefined ||
    e.originSha256 !== undefined
  );
}

export function primaryPathFromParsed(
  parsedEntry: string,
  aiRoot: string = BUNDLE_PATHS.aiRoot,
): string | null {
  const prefix = `${aiRoot.replace(/\/+$/, "")}/parsed/`;
  if (!parsedEntry.startsWith(prefix) || !parsedEntry.endsWith(".md")) {
    return null;
  }
  return parsedEntry.slice(prefix.length, -".md".length);
}

function summaryFromEntry(e: ZipListEntry, aiRoot: string): OriginSummary | null {
  const primaryPath = primaryPathFromParsed(e.name, aiRoot);
  if (!primaryPath) return null;
  return {
    parsedPath: e.name,
    primaryPath,
    ...pickOriginApiFields(e),
  };
}

function parsedCandidates(
  selector: string,
  aiRoot: string,
): string[] {
  const n = normalizeEntryName(selector);
  const prefix = `${aiRoot.replace(/\/+$/, "")}/parsed/`;
  const out: string[] = [];
  const add = (p: string) => {
    if (!out.includes(p)) out.push(p);
  };
  add(n);
  if (n.startsWith(prefix)) {
    add(n.endsWith(".md") ? n : `${n}.md`);
  } else {
    const asName = n.endsWith(".md") ? n : `${n}.md`;
    add(`${prefix}${asName}`);
    add(`${prefix}${n}.md`);
  }
  return out;
}

export function originFromEntries(
  entries: ZipListEntry[],
  selector: string,
  aiRoot: string = BUNDLE_PATHS.aiRoot,
): OriginSummary | null {
  const n = normalizeEntryName(selector);
  const prefix = `${aiRoot.replace(/\/+$/, "")}/parsed/`;
  for (const cand of parsedCandidates(n, aiRoot)) {
    const hit = entries.find((e) => e.name === cand);
    if (hit && entryHasOrigin(hit)) {
      return summaryFromEntry(hit, aiRoot);
    }
  }
  const byPrimary = entries.find((e) => {
    if (!e.name.startsWith(prefix) || !e.name.endsWith(".md")) return false;
    const primary = primaryPathFromParsed(e.name, aiRoot);
    return primary === n && entryHasOrigin(e);
  });
  if (byPrimary) return summaryFromEntry(byPrimary, aiRoot);
  const base = n.split("/").pop() ?? n;
  const byBasename = entries.find((e) => {
    const primary = primaryPathFromParsed(e.name, aiRoot);
    return (
      entryHasOrigin(e) &&
      (primary === base ||
        e.name.endsWith(`/${base}.md`) ||
        e.name.endsWith(`/${base}`))
    );
  });
  return byBasename ? summaryFromEntry(byBasename, aiRoot) : null;
}

export function lookupOrigin(args: {
  package?: string;
  path?: string;
  name?: string;
}): OriginSummary {
  const zipPath = resolvePackagePath(args.package);
  const selector = (args.path ?? args.name ?? "").trim();
  if (!selector) {
    throw new AccessError(
      "Provide `path` (parsed entry or primary) or `name`.",
    );
  }
  return useZipHandle(zipPath, () => {
    const found = originFromEntries(listZipEntries(zipPath), selector);
    if (!found) {
      throw new AccessError(
        `No Extra Field 0x014F origin on parse for: ${selector}`,
        "not_found",
      );
    }
    return found;
  });
}

function assertAllowedOriginUrl(url: URL): void {
  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:" &&
    url.protocol !== "file:"
  ) {
    throw new AccessError(
      `Unsupported origin URI scheme: ${url.protocol.replace(":", "")}`,
      "invalid_args",
    );
  }
}

async function readHttpOrigin(url: URL, maxBytes: number): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new AccessError(
      `Origin HTTP ${res.status} for ${url.href}`,
      "io_error",
    );
  }
  const final = new URL(res.url);
  if (final.protocol !== "http:" && final.protocol !== "https:") {
    throw new AccessError(
      `Origin redirect to unsupported scheme ${final.protocol.replace(":", "")}`,
      "invalid_args",
    );
  }
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new AccessError(
      `Origin exceeds maxBytes (${declared} > ${maxBytes})`,
      "invalid_args",
    );
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new AccessError(
        `Origin exceeds maxBytes (${buf.length} > ${maxBytes})`,
        "invalid_args",
      );
    }
    return buf;
  }
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk);
    n += buf.length;
    if (n > maxBytes) {
      throw new AccessError(
        `Origin exceeds maxBytes (${n} > ${maxBytes})`,
        "invalid_args",
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function readFileOrigin(url: URL, maxBytes: number): Buffer {
  let filePath: string;
  try {
    filePath = fileURLToPath(url);
  } catch {
    throw new AccessError(`Invalid file: origin URI: ${url.href}`, "invalid_args");
  }
  if (!existsSync(filePath)) {
    throw new AccessError(`Origin file not found: ${filePath}`, "not_found");
  }
  const st = statSync(filePath);
  if (!st.isFile()) {
    throw new AccessError(`Origin is not a file: ${filePath}`, "invalid_args");
  }
  if (st.size > maxBytes) {
    throw new AccessError(
      `Origin exceeds maxBytes (${st.size} > ${maxBytes})`,
      "invalid_args",
    );
  }
  return readFileSync(filePath);
}

function writeOriginFile(
  destFile: string,
  destRoot: string,
  data: Buffer,
  overwrite: boolean,
): string {
  const abs = isAbsolute(destFile) ? destFile : resolve(process.cwd(), destFile);
  const root = isAbsolute(destRoot) ? destRoot : resolve(process.cwd(), destRoot);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new AccessError(
      `Refusing to write origin outside dest: ${abs}`,
      "invalid_args",
    );
  }
  mkdirSync(dirname(abs), { recursive: true });
  if (existsSync(abs) && overwrite !== true) {
    throw new AccessError(
      `Refusing to overwrite ${abs} (pass --overwrite)`,
      "invalid_args",
    );
  }
  writeFileSync(abs, data);
  return abs;
}

/**
 * Fetch the original at Extra Field 0x014F `originUri` and check CRC-32
 * (and size / SHA-256 when those tags were written).
 *
 * Does not return payload bytes. Writes to disk only when `dest` is set
 * (or `write` is true). Refuses to write on a failed check.
 */
export async function fetchOrigin(args: {
  package?: string;
  path?: string;
  name?: string;
  /** Destination file or directory. Directory → originals/<primary>. */
  dest?: string;
  write?: boolean;
  overwrite?: boolean;
  maxBytes?: number;
}): Promise<OriginFetchResult> {
  const zipPath = resolvePackagePath(args.package);
  const loc = lookupOrigin({ package: zipPath, path: args.path, name: args.name });
  if (!loc.originUri) {
    throw new AccessError(
      `Parse ${loc.parsedPath} has no originUri (cannot fetch)`,
      "not_found",
    );
  }
  let url: URL;
  try {
    url = new URL(loc.originUri);
  } catch {
    throw new AccessError(`Invalid originUri: ${loc.originUri}`, "invalid_args");
  }
  assertAllowedOriginUrl(url);

  const maxBytes = args.maxBytes ?? DEFAULT_MAX_ORIGIN_BYTES;
  if (loc.originSize !== undefined && loc.originSize > maxBytes) {
    throw new AccessError(
      `Origin size tag ${loc.originSize} exceeds maxBytes ${maxBytes}`,
      "invalid_args",
    );
  }

  const data =
    url.protocol === "file:"
      ? readFileOrigin(url, maxBytes)
      : await readHttpOrigin(url, maxBytes);

  const actualCrc = originCrc32Of(data);
  const expectedCrc =
    loc.originCrc32 !== undefined
      ? (() => {
          try {
            return originCrc32FromApi(loc.originCrc32);
          } catch {
            throw new AccessError(
              `Invalid originCrc32: ${loc.originCrc32}`,
              "invalid_args",
            );
          }
        })()
      : undefined;
  const crc32: OriginCheck = {
    actual: originCrc32Hex(actualCrc),
    ...(expectedCrc !== undefined
      ? {
          expected: originCrc32Hex(expectedCrc),
          matched: expectedCrc === actualCrc,
        }
      : {}),
  };

  const actualSha = createHash("sha256").update(data).digest("hex");
  const sha256: OriginCheck | undefined =
    loc.originSha256 !== undefined
      ? {
          expected: loc.originSha256,
          actual: actualSha,
          matched: loc.originSha256.toLowerCase() === actualSha,
        }
      : undefined;

  const size: OriginCheck | undefined =
    loc.originSize !== undefined
      ? {
          expected: loc.originSize,
          actual: data.length,
          matched: loc.originSize === data.length,
        }
      : undefined;

  const checks = [crc32.matched, sha256?.matched, size?.matched].filter(
    (v): v is boolean => v !== undefined,
  );
  const verified = checks.length === 0 ? false : checks.every(Boolean);

  if (checks.length > 0 && !verified) {
    const bits: string[] = [];
    if (crc32.matched === false) {
      bits.push(`crc32 expected ${crc32.expected} got ${crc32.actual}`);
    }
    if (sha256?.matched === false) {
      bits.push(`sha256 mismatch`);
    }
    if (size?.matched === false) {
      bits.push(`size expected ${size.expected} got ${size.actual}`);
    }
    throw new AccessError(
      `Origin integrity failed for ${loc.primaryPath}: ${bits.join("; ")}`,
      "integrity_failed",
    );
  }

  const wantWrite = args.write === true || Boolean(args.dest?.trim());
  let outPath: string | undefined;
  if (wantWrite) {
    const extractRoot = defaultExtractRoot(zipPath);
    const destArg = args.dest?.trim();
    let destFile: string;
    let destRoot: string;
    if (!destArg) {
      destRoot = join(extractRoot, "originals");
      destFile = join(destRoot, loc.primaryPath);
    } else {
      const abs = isAbsolute(destArg) ? destArg : resolve(process.cwd(), destArg);
      const looksDir =
        destArg.endsWith("/") ||
        destArg.endsWith("\\") ||
        (existsSync(abs) && statSync(abs).isDirectory());
      if (looksDir) {
        destRoot = abs;
        destFile = join(abs, loc.primaryPath);
      } else {
        destRoot = dirname(abs);
        destFile = abs;
      }
    }
    outPath = writeOriginFile(
      destFile,
      destRoot,
      data,
      args.overwrite === true,
    );
  }

  return {
    package: zipPath,
    ...loc,
    originUri: loc.originUri,
    bytes: data.length,
    crc32,
    ...(sha256 ? { sha256 } : {}),
    ...(size ? { size } : {}),
    ...(outPath ? { path: outPath } : {}),
    verified,
  };
}

export async function extractWithOrigin(args: {
  package?: string;
  paths?: string[];
  dest?: string;
  overwrite?: boolean;
  fetchOrigin?: boolean;
  maxBytes?: number;
}): Promise<{
  package: string;
  dest: string;
  extracted: ReturnType<typeof extractEntries>["extracted"];
  origins: OriginFetchResult[];
}> {
  const zipPath = resolvePackagePath(args.package);
  const extracted = extractEntries({
    package: zipPath,
    paths: args.paths,
    dest: args.dest,
    overwrite: args.overwrite,
  });
  const origins: OriginFetchResult[] = [];
  if (args.fetchOrigin === true) {
    const listed = useZipHandle(zipPath, () => listZipEntries(zipPath));
    const parsedExtracted = extracted.extracted.filter((f) =>
      listed.some((e) => e.name === f.entry && entryHasOrigin(e) && e.originUri),
    );
    const originRoot = join(extracted.dest, "originals");
    for (const f of parsedExtracted) {
      const loc = originFromEntries(listed, f.entry);
      origins.push(
        await fetchOrigin({
          package: zipPath,
          path: f.entry,
          dest: loc ? join(originRoot, loc.primaryPath) : originRoot,
          overwrite: args.overwrite,
          maxBytes: args.maxBytes,
        }),
      );
    }
  }
  return {
    package: extracted.package,
    dest: extracted.dest,
    extracted: extracted.extracted,
    origins,
  };
}
