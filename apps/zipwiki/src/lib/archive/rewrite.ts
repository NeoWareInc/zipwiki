/**
 * Copy-aware ZIP rewrite: emit a new archive, copying compressed payloads
 * for unchanged members (no recompress). Always rebuilds local/central/EOCD.
 */

import { renameSync, writeFileSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  classifyEntry,
  DEFAULT_AI_ROOT,
  type ZipArchiveEntry,
  type ZipPrecompressed,
} from "./nzip.js";
import { isMetaInfPath } from "./merkle.js";
import {
  listZipEntriesFromBuffer,
  readCompressedPayload,
  type ZipListEntry,
} from "./zip-list.js";
import {
  readLocalExtraField,
  readZipEntryVerifiedFromBuffer,
} from "./integrity.js";
import { parseOriginFromExtra } from "./origin-extra.js";

/** Sidecars that bind a Merkle root — mutation would stale them. */
export const PROOF_SIDECAR_NAMES = [
  "META-INF/TOKEN.NZIP",
  "META-INF/TIMESTAMP.NZIP",
  "META-INF/TS-SUBMIT.NZIP",
] as const;

export function hasProofSidecars(entryNames: Iterable<string>): string[] {
  const lower = new Set(
    [...entryNames].map((n) => n.replace(/\\/g, "/").toLowerCase()),
  );
  return PROOF_SIDECAR_NAMES.filter((n) => lower.has(n.toLowerCase()));
}

/** Slice compressed bytes + extras from an existing archive member. */
export function copyZipMember(
  buf: Buffer,
  listed: ZipListEntry,
  uncompressed: Buffer,
): ZipArchiveEntry {
  const extra = readLocalExtraField(buf, listed);
  const compressed = readCompressedPayload(buf, listed);
  const origin = parseOriginFromExtra(extra);
  const precompressed: ZipPrecompressed = {
    method: listed.method,
    data: compressed,
    crc32: listed.crc32 >>> 0,
    uncompressedSize: listed.uncompressedSize,
    extra,
    dosTime: listed.dosTime,
    dosDate: listed.dosDate,
  };
  return {
    name: listed.name,
    data: uncompressed,
    precompressed,
    ...(origin ? { origin } : {}),
  };
}

export type LoadedArchiveMembers = {
  buf: Buffer;
  listed: ZipListEntry[];
  entries: ZipArchiveEntry[];
};

/**
 * Inflate + verify every file member, keeping compressed slices for rewrite.
 */
export function loadCopyableArchive(zipPath: string): LoadedArchiveMembers {
  const buf = readFileSync(zipPath);
  const listed = listZipEntriesFromBuffer(buf);
  const proofs = hasProofSidecars(listed.map((e) => e.name));
  if (proofs.length > 0) {
    throw new Error(
      `Cannot update archive with proof sidecars (${proofs.join(", ")}); re-stamp after a full pack.`,
    );
  }
  const entries: ZipArchiveEntry[] = [];
  for (const e of listed) {
    if (e.name.endsWith("/")) continue;
    const verified = readZipEntryVerifiedFromBuffer(buf, e.name);
    entries.push(copyZipMember(buf, e, verified.data));
  }
  return { buf, listed, entries };
}

/**
 * Pack CD order: manifest → AI-root (parsed + okf) → primaries.
 * Remaining META-INF members follow the manifest.
 */
export function sortPackOrder(
  entries: ZipArchiveEntry[],
  aiRoot: string = DEFAULT_AI_ROOT,
): ZipArchiveEntry[] {
  const manifest: ZipArchiveEntry[] = [];
  const otherMeta: ZipArchiveEntry[] = [];
  const wiki: ZipArchiveEntry[] = [];
  const primaries: ZipArchiveEntry[] = [];
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/");
    if (name === "META-INF/manifest.json") {
      manifest.push(e);
      continue;
    }
    const cls = classifyEntry(name, aiRoot);
    if (cls === "meta") otherMeta.push(e);
    else if (cls === "ai") wiki.push(e);
    else primaries.push(e);
  }
  const byName = (a: ZipArchiveEntry, b: ZipArchiveEntry) =>
    Buffer.from(a.name, "utf-8").compare(Buffer.from(b.name, "utf-8"));
  wiki.sort(byName);
  primaries.sort(byName);
  otherMeta.sort(byName);
  return [...manifest, ...otherMeta, ...wiki, ...primaries];
}

/** Next frozen collision path: basename, else content/N/basename. */
export function nextAvailablePrimaryPath(
  fileName: string,
  usedPaths: Iterable<string>,
): string {
  const base = basename(fileName).replace(/\\/g, "/");
  const used = new Set(
    [...usedPaths].map((p) => p.replace(/\\/g, "/")),
  );
  if (!used.has(base)) return base;
  let n = 2;
  let candidate = `content/${n}/${base}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `content/${n}/${base}`;
  }
  return candidate;
}

/** Strip `wiki/parsed/P.md` (or `…/parsed/P.md`) to logical primary P. */
export function logicalPrimaryFromUserKey(key: string): string {
  const norm = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (norm.includes(".assets/")) return norm;
  const parsedIdx = norm.lastIndexOf("/parsed/");
  if (parsedIdx >= 0 && norm.endsWith(".md")) {
    return norm.slice(parsedIdx + "/parsed/".length, -".md".length);
  }
  if (norm.startsWith("parsed/") && norm.endsWith(".md")) {
    return norm.slice("parsed/".length, -".md".length);
  }
  return norm;
}

function primaryStem(path: string): string {
  const base = basename(path.replace(/\\/g, "/"));
  const dot = base.indexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

/**
 * Resolve a user key to an existing ZIP primary path.
 * Exact path wins; parse-member keys (`wiki/parsed/P.md`) and unique basename
 * or OKF stem matches are allowed; ambiguous matches error.
 */
export function resolveExistingPrimaryPath(
  key: string,
  primaryPaths: readonly string[],
): string {
  const norm = logicalPrimaryFromUserKey(key);
  if (primaryPaths.includes(norm)) return norm;
  const base = basename(norm);
  const baseMatches = primaryPaths.filter(
    (p) => p === base || p.endsWith(`/${base}`) || basename(p) === base,
  );
  if (baseMatches.length === 1) return baseMatches[0]!;
  if (baseMatches.length > 1) {
    throw new Error(
      `Ambiguous primary "${key}": ${baseMatches.join(", ")} — use the full ZIP path`,
    );
  }
  const stem = primaryStem(norm);
  const stemMatches = primaryPaths.filter((p) => primaryStem(p) === stem);
  if (stemMatches.length === 1) return stemMatches[0]!;
  if (stemMatches.length > 1) {
    throw new Error(
      `Ambiguous primary "${key}": ${stemMatches.join(", ")} — use the full ZIP path`,
    );
  }
  const have =
    primaryPaths.length > 0
      ? ` (have: ${primaryPaths.join(", ")})`
      : " (package has no primaries)";
  throw new Error(`Primary not found: ${key}${have}`);
}

export function writeArchiveAtomic(destPath: string, zipBuf: Buffer): void {
  const tmp = join(
    dirname(destPath),
    `.${Date.now()}-${Math.random().toString(36).slice(2)}.zipwiki.tmp`,
  );
  writeFileSync(tmp, zipBuf);
  renameSync(tmp, destPath);
}

export function isContentPath(name: string): boolean {
  return !isMetaInfPath(name);
}
