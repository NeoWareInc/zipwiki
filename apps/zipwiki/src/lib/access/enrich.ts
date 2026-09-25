import {
  BUNDLE_PATHS,
  loadCopyableArchive,
  loadPackageInventory,
  sortPackOrder,
  writeArchiveAtomic,
  writeZipBuffer,
  type ZipArchiveEntry,
} from "../archive/index.js";
import {
  buildOkfBundle,
  conceptFileNameFor,
  syncOkfArchive,
  type OkfEnrichment,
  type OkfPrimaryRef,
} from "../okf/index.js";
import {
  AccessError,
  normalizeEntryName,
  resolvePackagePath,
} from "./resolve.js";

export type EnrichOkfArgs = {
  package?: string;
  /** OKF concept path (e.g. wiki/okf/deed.md) or filename. */
  path?: string;
  /** Concept stem without .md (alternative to path). */
  stem?: string;
  enrichment: OkfEnrichment;
  /** Optional primary path(s) for sources; defaults from manifest. */
  primaryPath?: string;
};

export type EnrichOkfResult = {
  package: string;
  path: string;
  title: string;
  conceptType: string;
};

function resolveConceptFileName(args: EnrichOkfArgs): string {
  if (args.path?.trim()) {
    let p = normalizeEntryName(args.path.trim());
    if (p.startsWith(BUNDLE_PATHS.okfRoot)) {
      p = p.slice(BUNDLE_PATHS.okfRoot.length);
    }
    return p.endsWith(".md") ? p : `${p}.md`;
  }
  if (args.stem?.trim()) {
    const stem = args.stem.trim().replace(/\.md$/i, "");
    return `${stem}.md`;
  }
  if (args.primaryPath?.trim()) {
    return conceptFileNameFor(args.primaryPath.trim());
  }
  throw new AccessError(
    "Provide `path`, `stem`, or `primaryPath` for the OKF concept.",
  );
}

function loadManifestPrimaries(zipPath: string): OkfPrimaryRef[] {
  try {
    const inventory = loadPackageInventory(zipPath);
    return [...inventory.primaries.values()].map((s) => ({
      path: s.path,
      ...(s.manifest?.documentType
        ? { documentType: s.manifest.documentType }
        : {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Apply host-LLM (or any) OKF enrichment into an existing `.nzip` via injected
 * enrichment. Rewrites the archive in place (atomic replace), copying
 * unchanged compressed members so Extra Field 0x014F survives.
 */
export async function enrichOkf(args: EnrichOkfArgs): Promise<EnrichOkfResult> {
  const zipPath = resolvePackagePath(args.package);
  const enrichment = args.enrichment;
  if (!enrichment?.title?.trim() || !enrichment?.description?.trim() || !enrichment?.type?.trim()) {
    throw new AccessError(
      "enrichment requires title, description, and type.",
      "invalid_args",
    );
  }

  const conceptFileName = resolveConceptFileName(args);
  const inventory = loadPackageInventory(zipPath);
  const okfRoot = inventory.okfRoot;
  const conceptZipPath = `${okfRoot}${conceptFileName}`;

  let primaries = loadManifestPrimaries(zipPath);
  if (args.primaryPath?.trim()) {
    const p = args.primaryPath.trim();
    if (!primaries.some((x) => x.path === p)) {
      primaries = [{ path: p }, ...primaries];
    }
  }
  if (primaries.length === 0) {
    const stem = conceptFileName.replace(/\.md$/i, "");
    primaries = [{ path: stem }];
  }

  const primaryForConcept = args.primaryPath?.trim()
    ? primaries.filter((p) => p.path === args.primaryPath!.trim())
    : primaries.slice(0, 1);
  const built = await buildOkfBundle({
    primaries:
      primaryForConcept.length > 0 ? primaryForConcept : primaries.slice(0, 1),
    enrichment,
    conceptFileName,
    includeIndex: false,
    useAi: false,
    generatedBy: "zipaccess-host-llm",
  });

  const conceptData = Buffer.from(built.files[0]!.data, "utf8");

  const loaded = loadCopyableArchive(zipPath);
  const map = new Map<string, ZipArchiveEntry>();
  for (const e of loaded.entries) map.set(e.name, e);

  map.set(conceptZipPath, { name: conceptZipPath, data: conceptData });

  const indexPath = `${okfRoot}index.md`;
  const synced = syncOkfArchive({
    okfRoot,
    files: [...map.values()]
      .filter((e) => e.name.startsWith(okfRoot) && e.name.endsWith(".md"))
      .map((e) => ({ name: e.name, data: e.data.toString("utf8") })),
    entryNames: map.keys(),
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

  if (map.has(BUNDLE_PATHS.manifest)) {
    try {
      const man = JSON.parse(
        map.get(BUNDLE_PATHS.manifest)!.data.toString("utf8"),
      ) as Record<string, unknown>;
      const ai = (man.ai ?? {}) as Record<string, unknown>;
      const okf = (ai.okf ?? {}) as Record<string, unknown>;
      okf.present = true;
      okf.root = okf.root ?? okfRoot.replace(/\/$/, "");
      okf.index = okf.index ?? indexPath;
      ai.okf = okf;
      man.ai = ai;
      map.set(BUNDLE_PATHS.manifest, {
        name: BUNDLE_PATHS.manifest,
        data: Buffer.from(`${JSON.stringify(man, null, 2)}\n`, "utf8"),
      });
    } catch {
      // leave manifest unchanged
    }
  }

  const entries = sortPackOrder([...map.values()], inventory.aiRoot);
  writeArchiveAtomic(zipPath, writeZipBuffer(entries));

  return {
    package: zipPath,
    path: conceptZipPath,
    title: built.title,
    conceptType: built.conceptType,
  };
}
