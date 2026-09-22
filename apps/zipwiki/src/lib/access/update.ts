/**
 * Knowledge-coherent add / update / delete for an existing `.zipwiki`.
 * Full ZIP rewrite; unchanged members keep compressed bytes.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, dirname, join, resolve, basename } from "node:path";
import {
  BUNDLE_PATHS,
  classifyEntry,
  contentMerkleRoot,
  findOrphanParses,
  isOmittableDocumentSource,
  parsedMarkdownFileName,
  parsedPathFor,
  serializeNeoZipManifest,
  writeZipBuffer,
  type CompressOptions,
  type NeoZipAi,
  type NeoZipAiPrimary,
  type NeoZipManifest,
  type ZipArchiveEntry,
} from "../archive/index.js";
import {
  loadCopyableArchive,
  nextAvailablePrimaryPath,
  resolveExistingPrimaryPath,
  sortPackOrder,
  writeArchiveAtomic,
} from "../archive/rewrite.js";
import {
  loadPackageInventory,
  okfStemOwners,
  type PackageInventory,
} from "../archive/inventory.js";
import {
  originLocatorFromOriginal,
  originLocatorPresent,
  cliOriginOverlay,
  resolveOriginUri,
} from "../archive/index.js";
import { conceptFileNameFor } from "../okf/render.js";
import {
  parseFrontmatterFields,
  renderConceptMarkdown,
  splitFrontmatter,
} from "../okf/frontmatter.js";
import { formatLogLine, syncOkfArchive } from "../okf/bundle.js";
import { parseOneFile, okfOneFile } from "../../pipeline/phases.js";
import {
  loadZipwikiConfig,
  resolveOmitOriginalDocuments,
  type ResolvedZipwikiConfig,
} from "../config/index.js";
import type { StageOptions } from "../../pipeline/types.js";
import type { DocumentType } from "../archive/index.js";
import { AccessError } from "./resolve.js";

export type UpdateSpec = {
  entry: string;
  file: string;
};

export type UpdateIngestHooks = {
  parse?: (
    abs: string,
    opts: StageOptions,
    project: ResolvedZipwikiConfig,
  ) => Promise<{ markdown: string; documentType?: string }>;
};

export type UpdatePackageInput = {
  package: string;
  output?: string;
  add?: string[];
  del?: string[];
  update?: UpdateSpec[];
  noAiOkf?: boolean;
  noOkf?: boolean;
  omitOriginalDocuments?: boolean;
  parser?: StageOptions["parser"];
  parserMode?: StageOptions["parserMode"];
  compression?: CompressOptions["compression"];
  level?: number;
  deflate?: boolean;
  legacy?: boolean;
  storeSuffixes?: string[];
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  /** Write Extra Field 0x014E on newly compressed members. */
  sha256Extra?: boolean;
  /** Include SHA-256 of original bytes in Extra Field 0x014F (instead of CRC-32). */
  originSha256?: boolean;
  /** Compute Merkle v1 root (blockchain proofs). */
  computeMerkle?: boolean;
  quiet?: boolean;
  config?: string;
  noOcr?: boolean;
  /** Persist wiki/ + META-INF/manifest.json here after rewrite. */
  stageDir?: string;
  /** Test-only parse override (skip LiteParse). */
  hooks?: UpdateIngestHooks;
};

export type UpdatePackageResult = {
  package: string;
  added: string[];
  updated: string[];
  removed: string[];
  warnings: string[];
  /** Present only when `computeMerkle` was set. */
  merkleRoot?: string;
  stageDir?: string;
};

function logUpdate(quiet: boolean, message: string): void {
  if (!quiet) console.error(`[zipwiki] update ${message}`);
}

function writeStageDir(
  stageDir: string,
  entries: ZipArchiveEntry[],
  aiRoot: string,
): void {
  mkdirSync(stageDir, { recursive: true });
  const prefix = `${aiRoot.replace(/\/+$/, "")}/`;
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/");
    if (name !== BUNDLE_PATHS.manifest && !name.startsWith(prefix)) continue;
    const dest = join(stageDir, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, e.data);
  }
}

function guessMime(path: string): string {
  const ext = extname(path).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
}

function parseUpdateSpec(spec: string): UpdateSpec {
  const trimmed = spec.trim();
  const eq = trimmed.indexOf("=");
  if (eq === -1) {
    if (!trimmed) {
      throw new AccessError(
        `Invalid --update spec "${spec}" (expected FILE or ZIPPATH=FILE)`,
        "invalid_args",
      );
    }
    return {
      entry: basename(trimmed.replace(/\\/g, "/")),
      file: trimmed,
    };
  }
  if (eq === 0 || eq === trimmed.length - 1) {
    throw new AccessError(
      `Invalid --update spec "${spec}" (expected FILE or ZIPPATH=FILE)`,
      "invalid_args",
    );
  }
  return { entry: trimmed.slice(0, eq), file: trimmed.slice(eq + 1) };
}

export function parseUpdateSpecs(specs: string[] | undefined): UpdateSpec[] {
  return (specs ?? []).map(parseUpdateSpec);
}

function citesPrimary(
  resource: string,
  primaryPath: string,
  parsedPath: string,
): boolean {
  const r = resource.replace(/\\/g, "/");
  const p = primaryPath.replace(/\\/g, "/");
  const parsed = parsedPath.replace(/\\/g, "/");
  if (r === p || r === parsed) return true;
  if (r.endsWith(`/${p}`) || r.endsWith(`/${parsed}`)) return true;
  if (r.includes("parsed/") && r.endsWith(`/${p}.md`)) return true;
  return false;
}

function dropSourcesForPrimary(
  markdown: string,
  primaryPath: string,
  parsedPath: string,
): string {
  const split = splitFrontmatter(markdown);
  if (!split.frontmatter) return markdown;
  const fields = parseFrontmatterFields(split.frontmatter);
  if (!fields.sources?.length) return markdown;
  const next = fields.sources.filter(
    (s) => !citesPrimary(s.resource ?? "", primaryPath, parsedPath),
  );
  if (next.length === fields.sources.length) return markdown;
  return renderConceptMarkdown({ ...fields, sources: next }, split.body);
}

function removeMemberGraph(
  map: Map<string, ZipArchiveEntry>,
  slotPath: string,
  inventory: PackageInventory,
  warnings: string[],
): void {
  const slot = inventory.primaries.get(slotPath);
  const parsedPath = parsedPathFor(
    slotPath,
    inventory.aiRoot,
    inventory.parsedDir,
  );
  map.delete(slotPath);
  map.delete(parsedPath);
  const assetPrefix = `${inventory.aiRoot}/${inventory.parsedDir}/${slotPath}.assets/`;
  for (const name of [...map.keys()]) {
    if (name.startsWith(assetPrefix)) map.delete(name);
  }
  const okfPath =
    slot?.okfPath ?? `${inventory.okfRoot}${conceptFileNameFor(slotPath)}`;
  const owners = (slot ? okfStemOwners(inventory, okfPath) : [slotPath]).filter(
    (p) => p !== slotPath,
  );
  if (owners.length === 0) {
    map.delete(okfPath);
  } else {
    warnings.push(`Kept ${okfPath} (also used by ${owners.join(", ")})`);
  }
  for (const [name, entry] of map) {
    if (!name.startsWith(inventory.okfRoot) || !name.endsWith(".md")) continue;
    if (name.endsWith("index.md")) continue;
    const prev = entry.data.toString("utf8");
    const next = dropSourcesForPrimary(prev, slotPath, parsedPath);
    if (next !== prev) {
      map.set(name, { name, data: Buffer.from(next, "utf8") });
    }
  }
  inventory.primaries.delete(slotPath);
}

async function ingestFile(input: {
  abs: string;
  zipPath: string;
  inventory: PackageInventory;
  omitOriginal: boolean;
  noOkf: boolean;
  noAiOkf: boolean;
  opts: StageOptions;
  project: ResolvedZipwikiConfig;
  originOverlay: ReturnType<typeof cliOriginOverlay>;
  originSha256?: boolean;
  warnings: string[];
  hooks?: UpdateIngestHooks;
}): Promise<{
  zipPath: string;
  entries: ZipArchiveEntry[];
  primary: NeoZipAiPrimary;
  okfMode: "ai" | "fallback" | "skipped";
}> {
  const { abs, zipPath, inventory, omitOriginal, noOkf, noAiOkf, opts, project } =
    input;
  let markdown: string;
  let documentType: DocumentType;
  if (input.hooks?.parse) {
    const hooked = await input.hooks.parse(abs, opts, project);
    markdown = hooked.markdown;
    documentType = (hooked.documentType as DocumentType | undefined) ?? "Generic";
  } else {
    const parsed = await parseOneFile(abs, opts, project);
    markdown = parsed.markdown;
    documentType = parsed.member.documentType;
  }
  const data = readFileSync(abs);
  const mtime = statSync(abs).mtime;
  const originUri = resolveOriginUri(abs, {
    inputRoots: [resolve(abs, "..")],
    cliOverlay: input.originOverlay,
  });
  const origin = originLocatorFromOriginal({
    data,
    mtime,
    uri: originUri ?? undefined,
    includeSha256: input.originSha256 === true,
  });
  const omit =
    omitOriginal &&
    isOmittableDocumentSource(zipPath) &&
    Boolean(markdown);
  const entries: ZipArchiveEntry[] = [];
  if (!omit) {
    entries.push({ name: zipPath, data, mtime });
  }
  const parsedZip = parsedPathFor(
    zipPath,
    inventory.aiRoot,
    inventory.parsedDir,
  );
  const parseEntry: ZipArchiveEntry = {
    name: parsedZip,
    data: Buffer.from(markdown, "utf8"),
  };
  const writeOrigin =
    Boolean(originUri) || omit || input.originSha256 === true;
  if (writeOrigin && originLocatorPresent(origin)) {
    parseEntry.origin = origin;
  }
  entries.push(parseEntry);

  const okfPath = `${inventory.okfRoot}${conceptFileNameFor(zipPath)}`;
  let okfMode: "ai" | "fallback" | "skipped" = "skipped";
  const stemOwners = [...inventory.primaries.values()]
    .filter((s) => s.okfPath === okfPath)
    .map((s) => s.path);
  if (!noOkf && stemOwners.length > 0) {
    input.warnings.push(
      `Skipped OKF ${okfPath} (stem already used by ${stemOwners.join(", ")})`,
    );
  } else if (!noOkf) {
    const stageDir = mkdtempSync(join(tmpdir(), "zipwiki-update-okf-"));
    try {
      const parsedDir = join(
        stageDir,
        inventory.aiRoot,
        inventory.parsedDir,
      );
      mkdirSync(parsedDir, { recursive: true });
      writeFileSync(join(parsedDir, parsedMarkdownFileName(zipPath)), markdown);
      const okf = await okfOneFile({
        abs,
        originalName: zipPath,
        parsedMarkdown: markdown,
        stageDir,
        useAi: noAiOkf !== true,
        quiet: input.opts.quiet === true,
        omitOriginalDocuments: omit,
        includeSha256:
          input.originSha256 === true || opts.sha256Extra === true,
      });
      okfMode = okf.mode;
      entries.push({
        name: okfPath,
        data: readFileSync(okf.path),
      });
    } catch (err) {
      input.warnings.push(
        `OKF skipped for ${zipPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      rmSync(stageDir, { recursive: true, force: true });
    }
  }

  const primary: NeoZipAiPrimary = {
    path: zipPath,
    mimeType: guessMime(abs),
    documentType,
    hasParsed: true,
    ...(omit ? { sourceIncluded: false } : {}),
  };
  return { zipPath, entries, primary, okfMode };
}

function patchManifest(
  inventory: PackageInventory,
  map: Map<string, ZipArchiveEntry>,
  primaries: NeoZipAiPrimary[],
): void {
  const existing = map.get(BUNDLE_PATHS.manifest);
  let man: NeoZipManifest;
  if (existing) {
    man = JSON.parse(existing.data.toString("utf8")) as NeoZipManifest;
  } else if (inventory.manifest) {
    man = inventory.manifest;
  } else {
    throw new AccessError(
      "Archive has no META-INF/manifest.json",
      "invalid_package",
    );
  }
  const assetEntryCount = [...map.keys()].filter((n) =>
    n.includes(".assets/"),
  ).length;
  const ai: NeoZipAi = {
    ...(man.ai ?? { root: inventory.aiRoot }),
    root: inventory.aiRoot,
    parsedDir: inventory.parsedDir,
    primaryCount: primaries.length,
    parsedCount: primaries.filter((p) => p.hasParsed).length,
    assetEntryCount,
    primaries,
  };
  const okfNames = [...map.keys()].filter(
    (n) =>
      n.startsWith(inventory.okfRoot) &&
      n.endsWith(".md") &&
      !n.endsWith("index.md") &&
      !n.endsWith("/log.md"),
  );
  const hasIndex = map.has(`${inventory.okfRoot}index.md`);
  if (okfNames.length > 0 || hasIndex) {
    ai.okf = {
      ...(typeof ai.okf === "object" && ai.okf ? ai.okf : {}),
      present: true,
      root: inventory.okfRoot,
      index: `${inventory.okfRoot}index.md`,
    };
  } else if (ai.okf && typeof ai.okf === "object") {
    ai.okf = { ...ai.okf, present: false };
  }
  man.ai = ai;
  map.set(BUNDLE_PATHS.manifest, {
    name: BUNDLE_PATHS.manifest,
    data: Buffer.from(serializeNeoZipManifest(man), "utf8"),
  });
}

function usedPathsFrom(
  map: Map<string, ZipArchiveEntry>,
  inventory: PackageInventory,
): Set<string> {
  const used = new Set(inventory.primaries.keys());
  for (const name of map.keys()) {
    if (classifyEntry(name, inventory.aiRoot) === "primary") used.add(name);
  }
  return used;
}

function rememberPrimary(
  inventory: PackageInventory,
  p: string,
  primary: NeoZipAiPrimary,
): void {
  inventory.primaries.set(p, {
    path: p,
    hasPrimaryEntry: primary.sourceIncluded !== false,
    parsedPath: parsedPathFor(p, inventory.aiRoot, inventory.parsedDir),
    assetPrefix: `${inventory.aiRoot}/${inventory.parsedDir}/${p}.assets/`,
    okfPath: `${inventory.okfRoot}${conceptFileNameFor(p)}`,
    sourceIncluded: primary.sourceIncluded !== false,
    hasParsed: true,
    manifest: primary,
  });
}

export async function updatePackage(
  input: UpdatePackageInput,
): Promise<UpdatePackageResult> {
  const add = (input.add ?? []).map((f) => resolve(f));
  const delKeys = input.del ?? [];
  const updateSpecs = (input.update ?? []).map((r) => ({
    entry: r.entry,
    file: resolve(r.file),
  }));
  if (add.length === 0 && delKeys.length === 0 && updateSpecs.length === 0) {
    throw new AccessError(
      "update requires --add, --del, and/or --update",
      "invalid_args",
    );
  }
  for (const f of [...add, ...updateSpecs.map((r) => r.file)]) {
    if (!existsSync(f)) {
      throw new AccessError(`File not found: ${f}`, "not_found");
    }
  }

  const zipPath = resolve(input.package);
  if (!existsSync(zipPath)) {
    throw new AccessError(`Package not found: ${zipPath}`, "not_found");
  }

  const inventory = loadPackageInventory(zipPath);
  const loaded = loadCopyableArchive(zipPath);
  const map = new Map<string, ZipArchiveEntry>();
  for (const e of loaded.entries) map.set(e.name, e);

  const { config: project } = loadZipwikiConfig(
    {
      configPath: input.config,
      noAiOkf: input.noAiOkf,
      omitOriginalDocuments: input.omitOriginalDocuments,
      parserEngine: input.parser,
      parserMode: input.parserMode,
      noOcr: input.noOcr,
    },
    process.cwd(),
  );
  const omitOriginal = resolveOmitOriginalDocuments({
    cli: input.omitOriginalDocuments,
    pack: project.pack,
  });
  const opts: StageOptions = {
    noAiOkf: input.noAiOkf,
    noOkf: input.noOkf,
    noOcr: input.noOcr,
    parser: input.parser,
    parserMode: input.parserMode,
    quiet: input.quiet === true,
    originPattern: input.originPattern,
    originUrlTemplate: input.originUrlTemplate,
    originFile: input.originFile,
    sha256Extra: input.sha256Extra,
    originSha256: input.originSha256,
  };
  const originOverlay = cliOriginOverlay({
    originPattern: input.originPattern,
    originUrlTemplate: input.originUrlTemplate,
    originFile: input.originFile,
  });

  const quiet = input.quiet === true;
  const warnings: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  const added: string[] = [];
  const logLines: string[] = [];

  const pathsNow = () => [...inventory.primaries.keys()];

  logUpdate(quiet, `open ${zipPath}`);

  for (const key of delKeys) {
    const p = resolveExistingPrimaryPath(key, pathsNow());
    logUpdate(quiet, `del ${p}`);
    removeMemberGraph(map, p, inventory, warnings);
    removed.push(p);
    logLines.push(
      formatLogLine({
        action: "del",
        primary: p,
        detail: "concept removed",
      }),
    );
  }

  for (const spec of updateSpecs) {
    const p = resolveExistingPrimaryPath(spec.entry, pathsNow());
    logUpdate(quiet, `update ${p} ← ${spec.file}`);
    removeMemberGraph(map, p, inventory, warnings);
    const ingested = await ingestFile({
      abs: spec.file,
      zipPath: p,
      inventory,
      omitOriginal,
      noOkf: input.noOkf === true,
      noAiOkf: input.noAiOkf === true,
      opts,
      project,
      originOverlay,
      originSha256: input.originSha256 === true,
      warnings,
      hooks: input.hooks,
    });
    for (const e of ingested.entries) map.set(e.name, e);
    rememberPrimary(inventory, p, ingested.primary);
    updated.push(p);
    logLines.push(
      formatLogLine({
        action: "update",
        primary: p,
        detail: `${conceptFileNameFor(p)} ${ingested.okfMode}`,
      }),
    );
    logUpdate(quiet, `updated ${p}`);
  }

  for (const file of add) {
    const used = usedPathsFrom(map, inventory);
    const p = nextAvailablePrimaryPath(file, used);
    logUpdate(quiet, `add ${file} → ${p} (parse + okf)`);
    const ingested = await ingestFile({
      abs: file,
      zipPath: p,
      inventory,
      omitOriginal,
      noOkf: input.noOkf === true,
      noAiOkf: input.noAiOkf === true,
      opts,
      project,
      originOverlay,
      originSha256: input.originSha256 === true,
      warnings,
      hooks: input.hooks,
    });
    for (const e of ingested.entries) map.set(e.name, e);
    rememberPrimary(inventory, p, ingested.primary);
    added.push(p);
    logLines.push(
      formatLogLine({
        action: "add",
        primary: p,
        detail: `${conceptFileNameFor(p)} ${ingested.okfMode}`,
      }),
    );
    logUpdate(quiet, `added ${p}`);
  }

  logUpdate(quiet, "rebuild OKF index + manifest");

  const synced = syncOkfArchive({
    okfRoot: inventory.okfRoot,
    files: [...map.values()]
      .filter((e) => e.name.startsWith(inventory.okfRoot) && e.name.endsWith(".md"))
      .map((e) => ({ name: e.name, data: e.data.toString("utf8") })),
    entryNames: map.keys(),
    logLines,
    allowedMissing: [...inventory.primaries.values()]
      .filter((slot) => !slot.sourceIncluded)
      .map((slot) => slot.path),
  });
  if (synced.dangling.length > 0) {
    throw new AccessError(
      `OKF still cites a missing member: ${synced.dangling.join("; ")}`,
      "invalid_package",
    );
  }
  for (const name of synced.delete) map.delete(name);
  for (const file of synced.put) {
    map.set(file.name, { name: file.name, data: Buffer.from(file.data, "utf8") });
  }

  const primaries: NeoZipAiPrimary[] = [...inventory.primaries.values()].map(
    (s) =>
      s.manifest ?? {
        path: s.path,
        hasParsed: s.hasParsed,
        ...(s.sourceIncluded ? {} : { sourceIncluded: false }),
      },
  );
  primaries.sort((a, b) => a.path.localeCompare(b.path));
  patchManifest(inventory, map, primaries);

  const entries = sortPackOrder([...map.values()], inventory.aiRoot);
  const allowedMissing = new Set(
    primaries.filter((p) => p.sourceIncluded === false).map((p) => p.path),
  );
  const orphans = findOrphanParses(
    entries.map((e) => e.name),
    inventory.aiRoot,
    inventory.parsedDir,
    allowedMissing,
  );
  if (orphans.length > 0) {
    throw new AccessError(
      `orphan parse entries: ${orphans.join(", ")}`,
      "invalid_package",
    );
  }

  const merkleRoot =
    input.computeMerkle === true
      ? contentMerkleRoot(
          entries
            .filter(
              (e) =>
                !e.name
                  .replace(/\\/g, "/")
                  .toLowerCase()
                  .startsWith("meta-inf/"),
            )
            .map((e) => ({ path: e.name, content: e.data })),
        )
      : undefined;

  const dest = input.output?.trim() || zipPath;
  logUpdate(quiet, `rewrite ${entries.length} members`);
  const zipBuf = writeZipBuffer(entries, {
    compression: input.compression,
    level: input.level,
    deflate: input.deflate,
    legacy: input.legacy,
    storeSuffixes: input.storeSuffixes,
    sha256Extra: input.sha256Extra === true,
  });
  writeArchiveAtomic(dest, zipBuf);

  let stageDir: string | undefined;
  if (input.stageDir?.trim()) {
    stageDir = resolve(input.stageDir.trim());
    writeStageDir(stageDir, entries, inventory.aiRoot);
    logUpdate(quiet, `stage ${stageDir}`);
  }
  logUpdate(quiet, `wrote ${dest}`);

  return {
    package: dest,
    added,
    updated,
    removed,
    warnings,
    ...(merkleRoot ? { merkleRoot } : {}),
    ...(stageDir ? { stageDir } : {}),
  };
}
