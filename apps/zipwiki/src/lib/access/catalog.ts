/**
 * Human / agent catalog: one row per primary with OKF, parse, original, next-read hints.
 */
import { basename } from "node:path";
import {
  loadPackageInventory,
  useZipHandle,
  readZipEntryVerified,
  listZipEntries,
} from "../archive/index.js";
import {
  parseFrontmatterFields,
  splitFrontmatter,
} from "../okf/index.js";
import { resolvePackagePath, rethrowAccess } from "./resolve.js";

export type CatalogReadHints = {
  /** Stem for `zipaccess read --okf <stem>` / MCP `read_okf` stem. */
  okfStem?: string;
  /** Name for `zipaccess read --parsed <name>` / MCP `read_parsed` name. */
  parsedName?: string;
  /** Archive entry path of the original when present. */
  originalPath?: string;
  /** Remote / file: locator from Extra Field 0x014F when original is omitted. */
  originUri?: string;
  /** Short CLI-style hints (relative to zipaccess / zipwiki read). */
  next: string[];
};

export type CatalogRow = {
  /** Primary path P (logical). */
  primary: string;
  /** OKF title, or null when no concept card. */
  title: string | null;
  /** OKF type, or null when no concept card. */
  type: string | null;
  hasOkf: boolean;
  okfPath: string | null;
  hasParsed: boolean;
  parsedPath: string | null;
  /** Original bytes present in the archive. */
  hasOriginal: boolean;
  originalPath: string | null;
  /** Extra Field 0x014F URI when known (remote or file:). */
  originUri: string | null;
  readHints: CatalogReadHints;
};

export type CatalogResult = {
  package: string;
  digest: string | null;
  primaryCount: number;
  okfPresent: boolean;
  conceptCount: number;
  rows: CatalogRow[];
};

/** Keys on each catalog row — CLI `zipaccess open --json` and MCP `open.catalog.rows[]`. */
export const CATALOG_ROW_FIELDS = [
  "primary",
  "title",
  "type",
  "hasOkf",
  "okfPath",
  "hasParsed",
  "parsedPath",
  "hasOriginal",
  "originalPath",
  "originUri",
  "readHints",
] as const satisfies readonly (keyof CatalogRow)[];

/** Keys on the catalog object — CLI `zipaccess open --json` and MCP `open.catalog`. */
export const CATALOG_RESULT_FIELDS = [
  "package",
  "digest",
  "primaryCount",
  "okfPresent",
  "conceptCount",
  "rows",
] as const satisfies readonly (keyof CatalogResult)[];

function okfStemFromPath(okfPath: string): string {
  return basename(okfPath).replace(/\.md$/i, "");
}

function parsedNameFromPath(parsedPath: string): string {
  return basename(parsedPath).replace(/\.md$/i, "");
}

function buildReadHints(args: {
  hasOkf: boolean;
  okfPath: string | null;
  hasParsed: boolean;
  parsedPath: string | null;
  hasOriginal: boolean;
  primary: string;
  originUri?: string | null;
}): CatalogReadHints {
  const next: string[] = [];
  let okfStem: string | undefined;
  let parsedName: string | undefined;
  if (args.hasOkf && args.okfPath) {
    okfStem = okfStemFromPath(args.okfPath);
    next.push(`read --okf ${okfStem}`);
  }
  if (args.hasParsed && args.parsedPath) {
    parsedName = parsedNameFromPath(args.parsedPath);
    next.push(`read --parsed ${parsedName}`);
  }
  if (args.hasOriginal) {
    next.push(`read --entry ${args.primary}`);
  } else if (args.originUri) {
    next.push(`origin --fetch --parsed ${parsedName ?? args.primary}`);
  }
  if (next.length === 0) {
    next.push("(no OKF or parse yet — re-pack with LibreOffice / parser)");
  }
  return {
    ...(okfStem ? { okfStem } : {}),
    ...(parsedName ? { parsedName } : {}),
    ...(args.hasOriginal ? { originalPath: args.primary } : {}),
    ...(args.originUri ? { originUri: args.originUri } : {}),
    next,
  };
}

function readOkfMeta(
  zipPath: string,
  okfPath: string,
): { title: string | null; type: string | null } {
  try {
    const md = readZipEntryVerified(zipPath, okfPath).data.toString("utf8");
    const { frontmatter } = splitFrontmatter(md);
    if (!frontmatter) return { title: null, type: null };
    const fields = parseFrontmatterFields(frontmatter);
    return {
      title: fields.title ? String(fields.title) : null,
      type: fields.type ? String(fields.type) : null,
    };
  } catch (err) {
    rethrowAccess(err);
  }
}

/**
 * Build a catalog of every logical primary (including unparsed / no-OKF).
 */
export function buildCatalog(packagePath?: string): CatalogResult {
  const path = resolvePackagePath(packagePath);
  return useZipHandle(path, () => buildCatalogLoaded(path));
}

function buildCatalogLoaded(path: string): CatalogResult {
  const inv = loadPackageInventory(path);
  const listed = listZipEntries(path);
  const originUriByParsed = new Map<string, string>();
  for (const e of listed) {
    if (e.originUri) originUriByParsed.set(e.name, e.originUri);
  }
  const digest =
    typeof inv.manifest?.ai?.digest === "string"
      ? inv.manifest.ai.digest
      : null;
  const conceptCount = [...inv.names].filter(
    (n) =>
      n.startsWith(inv.okfRoot) &&
      n.endsWith(".md") &&
      !n.endsWith("index.md") &&
      !n.endsWith("/log.md") &&
      !n.endsWith("/"),
  ).length;
  const okfPresent =
    Boolean(inv.manifest?.ai?.okf?.present) || conceptCount > 0;

  const rows: CatalogRow[] = [];
  for (const primary of [...inv.primaries.keys()].sort()) {
    const slot = inv.primaries.get(primary)!;
    const hasOkf = inv.names.has(slot.okfPath);
    const okfPath = hasOkf ? slot.okfPath : null;
    let title: string | null = null;
    let type: string | null = null;
    if (okfPath) {
      const meta = readOkfMeta(path, okfPath);
      title = meta.title;
      type = meta.type;
    } else if (slot.manifest?.documentType) {
      type = String(slot.manifest.documentType);
    }
    const originUri =
      (slot.parsedPath && originUriByParsed.get(slot.parsedPath)) || null;
    const hasOriginal = slot.sourceIncluded && slot.hasPrimaryEntry;
    rows.push({
      primary,
      title,
      type,
      hasOkf,
      okfPath,
      hasParsed: slot.hasParsed,
      parsedPath: slot.parsedPath,
      hasOriginal,
      originalPath: hasOriginal ? primary : null,
      originUri,
      readHints: buildReadHints({
        hasOkf,
        okfPath,
        hasParsed: slot.hasParsed,
        parsedPath: slot.parsedPath,
        hasOriginal,
        primary,
        originUri,
      }),
    });
  }

  return {
    package: path,
    digest,
    primaryCount: rows.length,
    okfPresent,
    conceptCount,
    rows,
  };
}

function pad(s: string, w: number): string {
  if (s.length > w) return s.slice(0, w - 1) + "…";
  return s + " ".repeat(w - s.length);
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

/** Pretty catalog for terminals (not JSON). */
export function formatCatalogText(catalog: CatalogResult): string {
  const lines: string[] = [];
  lines.push(`Package: ${catalog.package}`);
  const digest = catalog.digest?.trim();
  if (digest) lines.push(`Digest:  ${digest}`);
  lines.push(
    `Primaries: ${catalog.primaryCount}  |  OKF: ${catalog.okfPresent ? `yes (${catalog.conceptCount} concepts)` : "no"}`,
  );
  lines.push("");
  if (catalog.rows.length === 0) {
    lines.push("(no primaries)");
    return `${lines.join("\n")}\n`;
  }

  const colPrimary = Math.min(
    36,
    Math.max(12, ...catalog.rows.map((r) => r.primary.length)),
  );
  const colOkf = 28;
  lines.push(
    `${pad("PRIMARY", colPrimary)}  ${pad("OKF", colOkf)}  PARSED  ORIG  NEXT`,
  );
  lines.push(
    `${"-".repeat(colPrimary)}  ${"-".repeat(colOkf)}  ------  ----  ----`,
  );

  for (const r of catalog.rows) {
    const okfLabel = r.hasOkf
      ? [r.title, r.type ? `(${r.type})` : null].filter(Boolean).join(" ") ||
        r.okfPath ||
        "yes"
      : r.type
        ? `(no OKF · ${r.type})`
        : "(no OKF)";
    const next = r.readHints.next[0] ?? "—";
    lines.push(
      `${pad(r.primary, colPrimary)}  ${pad(okfLabel, colOkf)}  ${pad(yesNo(r.hasParsed), 6)}  ${pad(yesNo(r.hasOriginal), 4)}  ${next}`,
    );
    for (const extra of r.readHints.next.slice(1)) {
      lines.push(
        `${" ".repeat(colPrimary)}  ${" ".repeat(colOkf)}  ${" ".repeat(6)}  ${" ".repeat(4)}  ${extra}`,
      );
    }
  }
  lines.push("");
  lines.push(
    "Next: zipaccess search <package> \"<query>\"  |  zipaccess read <package> --okf <stem>",
  );
  return `${lines.join("\n")}\n`;
}

/** Attach CLI/MCP read hints to a search hit. */
export function readHintsForSearchHit(hit: {
  kind: "okf" | "parsed";
  path: string;
  sources?: string[];
}): CatalogReadHints {
  const next: string[] = [];
  let okfStem: string | undefined;
  let parsedName: string | undefined;
  if (hit.kind === "okf") {
    okfStem = okfStemFromPath(hit.path);
    next.push(`read --okf ${okfStem}`);
    for (const s of hit.sources ?? []) {
      const bare = basename(s.replace(/^\.\.\//, "")).replace(/\.md$/i, "");
      if (!bare) continue;
      parsedName = bare;
      next.push(`read --parsed ${bare}`);
      break;
    }
  } else {
    parsedName = parsedNameFromPath(hit.path);
    next.push(`read --parsed ${parsedName}`);
  }
  return {
    ...(okfStem ? { okfStem } : {}),
    ...(parsedName ? { parsedName } : {}),
    next,
  };
}

export type SearchHitWithHints = {
  score: number;
  kind: "okf" | "parsed";
  path: string;
  title?: string;
  snippet: string;
  sources?: string[];
  evidence?: boolean;
  readHints: CatalogReadHints;
};

/** Pretty search results with read hints. */
export function formatSearchText(args: {
  package: string;
  query: string;
  hits: SearchHitWithHints[];
}): string {
  const lines: string[] = [];
  lines.push(`Package: ${args.package}`);
  lines.push(`Query:   ${args.query}`);
  lines.push(`Hits:    ${args.hits.length}`);
  lines.push("");
  if (args.hits.length === 0) {
    lines.push("(no hits)");
    return lines.join("\n");
  }
  for (const [i, h] of args.hits.entries()) {
    const title = h.title ? ` — ${h.title}` : "";
    const role = h.evidence ? "evidence" : h.kind;
    lines.push(`${i + 1}. [${role}] ${h.path}${title}  (score ${h.score.toFixed(1)})`);
    lines.push(`   ${h.snippet.replace(/\s+/g, " ").trim()}`);
    lines.push(`   → ${h.readHints.next.join("  |  ")}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
