/**
 * Verified extract-to-disk and scoped reads under the extract root.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  listZipEntries,
  readZipEntryVerified,
  useZipHandle,
  type VerifyPayloadResult,
} from "../archive/index.js";
import { zipwikiHomeDir } from "../config/home.js";
import {
  bufferLooksUtf8,
  clipBytes,
  clipUtf8,
  DEFAULT_MAX_BYTES,
} from "./clip.js";
import {
  AccessError,
  DEFAULT_PACKAGE_NAME,
  normalizeEntryName,
  resolvePackagePath,
  rethrowAccess,
} from "./resolve.js";
import type { ReadResult } from "./open.js";

export function defaultExtractRoot(packageAbsPath: string): string {
  const stem =
    basename(packageAbsPath).replace(/\.(zipwiki|nzip)$/i, "") || "package";
  return join(zipwikiHomeDir(), "extract", stem);
}

function assertSafeEntryName(name: string): string {
  const n = normalizeEntryName(name);
  if (!n || n.endsWith("/")) {
    throw new AccessError(`Invalid entry path: ${name}`);
  }
  if (n.includes("..") || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) {
    throw new AccessError(
      `Unsafe entry path rejected: ${name}`,
      "invalid_args",
    );
  }
  return n;
}

function resolveDestRoot(
  packageAbs: string,
  dest?: string | null,
): string {
  const raw = dest?.trim();
  if (!raw) return defaultExtractRoot(packageAbs);
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export type ExtractedFile = {
  entry: string;
  path: string;
  integrity: {
    crc32: string;
    sha256?: string;
    sha256Checked: boolean;
  };
};

export type ExtractResult = {
  package: string;
  dest: string;
  extracted: ExtractedFile[];
};

/**
 * Inflate → verify CRC (+ SHA-256 when present) → write under dest.
 * Refuse to write on integrity failure.
 */
export function extractEntries(args: {
  package?: string;
  /** Entry paths; omit or include "*" for all non-directory entries. */
  paths?: string[];
  dest?: string;
  overwrite?: boolean;
}): ExtractResult {
  const zipPath = resolvePackagePath(args.package);
  return useZipHandle(zipPath, () => extractEntriesLoaded(zipPath, args));
}

function extractEntriesLoaded(
  zipPath: string,
  args: {
    paths?: string[];
    dest?: string;
    overwrite?: boolean;
  },
): ExtractResult {
  const destRoot = resolveDestRoot(zipPath, args.dest);
  mkdirSync(destRoot, { recursive: true, mode: 0o700 });

  const all = listZipEntries(zipPath).filter((e) => !e.name.endsWith("/"));
  const want = args.paths?.map((p) => p.trim()).filter(Boolean) ?? [];
  const extractAll =
    want.length === 0 || want.some((p) => p === "*" || p === "**");
  const selected = extractAll
    ? all
    : want.map((p) => {
        const name = assertSafeEntryName(p);
        const hit = all.find((e) => e.name === name);
        if (!hit) {
          throw new AccessError(`Entry not found: ${name}`, "not_found");
        }
        return hit;
      });

  const extracted: ExtractedFile[] = [];
  for (const e of selected) {
    const entryName = assertSafeEntryName(e.name);
    let data: Buffer;
    let integrity: VerifyPayloadResult;
    try {
      const verified = readZipEntryVerified(zipPath, entryName);
      data = verified.data;
      integrity = verified.integrity;
    } catch (err) {
      rethrowAccess(err);
    }

    const outFile = join(destRoot, ...entryName.split("/"));
    const outDir = dirname(outFile);
    // Ensure outFile stays under destRoot
    const rel = relative(destRoot, outFile);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      throw new AccessError(
        `Refusing to write outside extract root: ${entryName}`,
        "invalid_args",
      );
    }
    mkdirSync(outDir, { recursive: true });
    if (existsSync(outFile) && args.overwrite !== true) {
      throw new AccessError(
        `Refusing to overwrite ${outFile} (pass --overwrite)`,
        "invalid_args",
      );
    }
    writeFileSync(outFile, data);
    extracted.push({
      entry: entryName,
      path: outFile,
      integrity: {
        crc32: integrity.actualCrc32.toString(16).padStart(8, "0"),
        ...(integrity.actualSha256
          ? { sha256: integrity.actualSha256 }
          : {}),
        sha256Checked: integrity.sha256Ok !== undefined,
      },
    });
  }

  return { package: zipPath, dest: destRoot, extracted };
}

function resolveUnderRoot(root: string, pathArg: string): string {
  const rootReal = existsSync(root)
    ? realpathSync(root)
    : resolve(root);
  const candidate = isAbsolute(pathArg)
    ? pathArg
    : resolve(rootReal, pathArg);
  if (!existsSync(candidate)) {
    throw new AccessError(`File not found: ${candidate}`, "not_found");
  }
  const real = realpathSync(candidate);
  const rel = relative(rootReal, real);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new AccessError(
      `Path escapes extract root: ${pathArg}`,
      "invalid_args",
    );
  }
  return real;
}

/**
 * Read a file under the extract root (UTF-8 or base64), size-capped.
 */
export function readExtractedFile(args: {
  path: string;
  /** Extract root; default derived from package / DEFAULT_PACKAGE_NAME. */
  root?: string;
  package?: string;
  maxBytes?: number;
  offset?: number;
  asBinary?: boolean;
}): ReadResult {
  const zipHint = args.package?.trim()
    ? resolvePackagePath(args.package)
    : existsSync(resolve(process.cwd(), DEFAULT_PACKAGE_NAME))
      ? resolve(process.cwd(), DEFAULT_PACKAGE_NAME)
      : null;
  const root =
    args.root?.trim() ||
    (zipHint ? defaultExtractRoot(zipHint) : defaultExtractRoot(DEFAULT_PACKAGE_NAME));
  const absRoot = isAbsolute(root) ? root : resolve(process.cwd(), root);
  if (!args.path?.trim()) {
    throw new AccessError("Provide `path` under the extract root.");
  }
  const filePath = resolveUnderRoot(absRoot, args.path.trim());
  const buf = readFileSync(filePath);
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const offset = args.offset ?? 0;
  const preferBinary = args.asBinary === true || !bufferLooksUtf8(buf);
  if (preferBinary) {
    const clipped = clipBytes(buf, maxBytes, offset);
    return {
      package: zipHint ?? absRoot,
      path: filePath,
      encoding: "base64",
      truncated: clipped.truncated,
      totalBytes: clipped.totalBytes,
      offset,
      data: clipped.slice.toString("base64"),
    };
  }
  const clipped = clipUtf8(buf, maxBytes, offset);
  return {
    package: zipHint ?? absRoot,
    path: filePath,
    encoding: "utf8",
    truncated: clipped.truncated,
    totalBytes: clipped.totalBytes,
    offset,
    text: clipped.text,
  };
}
