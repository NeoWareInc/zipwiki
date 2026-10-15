/**
 * Create-time origin URI resolution for pack.
 *
 * Precedence (never guess):
 * 1. Per-file sidecar (*.url / *.origin.json)
 * 2. Nearest ancestor `.zipwiki-origins.json` that accepts the file
 * 3. CLI overlay (virtual rule on each pack input root)
 * 4. No match → null (omit Extra Field 0x014F)
 *
 * Rule files are pack input only — not written into the .zipwiki.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ORIGIN_URI_MAX_BYTES } from "./origin-extra.js";

export const ORIGINS_RULE_FILENAME = ".zipwiki-origins.json";
/** Tab- or space-separated file→URL map (pack input only). */
export const ORIGINS_TSV_FILENAME = ".zipwiki-origins.tsv";

/** True for origin rule/list/sidecar names that must never be packed as documents. */
export function isOriginPackInputName(name: string): boolean {
  if (name === ORIGINS_RULE_FILENAME || name === ORIGINS_TSV_FILENAME) {
    return true;
  }
  if (name.endsWith(".url")) return true;
  if (name.endsWith(".origin.json")) return true;
  return false;
}

export type OriginRule = {
  /** Optional filename regex; named groups fill urlTemplate. Fall through if no match. */
  pattern?: string;
  /** Absolute URI template with {name}, {path}, {dir}, and pattern group names. */
  urlTemplate?: string;
  /** When true, locator is pathToFileURL(absolute file). */
  file?: boolean;
  /** Optional globs (basename or path relative to rule dir); non-match → fall through. */
  include?: string[];
  /**
   * Explicit basename or path (relative to the rule directory) → absolute URI.
   * Checked before pattern / urlTemplate. Use for irregular corpora (earnings PDFs, etc.).
   */
  entries?: Record<string, string>;
};

export type ResolveOriginOptions = {
  /** Absolute pack input roots; rules do not walk above the containing root. */
  inputRoots: string[];
  /** Virtual rule applied at each input root when no directory rule matched. */
  cliOverlay?: OriginRule | null;
  /** Read com.google.drivefs.item-id and store the Drive file URL. */
  originDrive?: boolean;
};

function matchGlob(pathOrName: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const re = new RegExp(`^${escaped}$`, "i");
  return re.test(pathOrName) || re.test(basename(pathOrName));
}

function stripLeadingZeros(value: string): string {
  if (/^\d+$/.test(value)) {
    const n = value.replace(/^0+/, "");
    return n.length > 0 ? n : "0";
  }
  return value;
}

function posixRel(fromDir: string, fileAbs: string): string {
  return relative(fromDir, fileAbs).split(sep).join("/");
}

function containingRoot(fileAbs: string, roots: string[]): string | null {
  const normalized = resolve(fileAbs);
  let best: string | null = null;
  let bestLen = -1;
  for (const root of roots) {
    const r = resolve(root);
    if (normalized === r || normalized.startsWith(r + sep)) {
      if (r.length > bestLen) {
        best = r;
        bestLen = r.length;
      }
    }
  }
  return best;
}

/**
 * Normalize a locator string to an absolute RFC 3986 URI.
 * Absolute http(s)/file kept; OS paths → pathToFileURL; relative rejected.
 */
export function normalizeOriginUri(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Origin URI is empty");
  }
  if (/^https?:\/\//i.test(trimmed) || /^file:/i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error(`Invalid origin URI: ${trimmed}`);
    }
    if (url.protocol === "file:" && (!url.pathname || url.pathname === "/")) {
      throw new Error(`file: URI must be absolute: ${trimmed}`);
    }
    const out = url.href;
    if (Buffer.byteLength(out, "utf-8") > ORIGIN_URI_MAX_BYTES) {
      throw new Error(`Origin URI exceeds ${ORIGIN_URI_MAX_BYTES} bytes`);
    }
    return out;
  }
  // Bare Windows drive or UNC / POSIX absolute path → file URL.
  if (
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("\\\\") ||
    trimmed.startsWith("/")
  ) {
    const out = pathToFileURL(resolve(trimmed)).href;
    if (Buffer.byteLength(out, "utf-8") > ORIGIN_URI_MAX_BYTES) {
      throw new Error(`Origin URI exceeds ${ORIGIN_URI_MAX_BYTES} bytes`);
    }
    return out;
  }
  throw new Error(
    `Origin locator must be an absolute URI or absolute path (got: ${trimmed})`,
  );
}

function expandTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Origin template missing placeholder {${key}}`);
    }
    return vars[key]!;
  });
}

/**
 * Try one rule. Returns URI string on success, or `null` to fall through.
 */
export function tryApplyOriginRule(
  rule: OriginRule,
  fileAbs: string,
  ruleDir: string,
): string | null {
  const name = basename(fileAbs);
  const stem = name.slice(0, name.length - extname(name).length) || name;
  const relPath = posixRel(ruleDir, fileAbs);

  if (rule.include && rule.include.length > 0) {
    const ok = rule.include.some(
      (pat) => matchGlob(relPath, pat) || matchGlob(name, pat),
    );
    if (!ok) return null;
  }

  if (rule.entries && Object.keys(rule.entries).length > 0) {
    const hit =
      rule.entries[name] ??
      rule.entries[relPath] ??
      rule.entries[stem] ??
      null;
    if (hit) return normalizeOriginUri(hit);
  }

  const vars: Record<string, string> = {
    name: stem,
    path: relPath,
    dir: relPath.split("/")[0] || "",
  };

  if (rule.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern);
    } catch {
      throw new Error(`Invalid origin pattern: ${rule.pattern}`);
    }
    const m = re.exec(name) ?? re.exec(relPath);
    if (!m) return null;
    if (m.groups) {
      for (const [k, v] of Object.entries(m.groups)) {
        if (v !== undefined) vars[k] = stripLeadingZeros(v);
      }
    }
    for (let i = 1; i < m.length; i++) {
      const v = m[i];
      if (v !== undefined) vars[String(i)] = stripLeadingZeros(v);
    }
  }

  if (rule.file === true) {
    return normalizeOriginUri(pathToFileURL(resolve(fileAbs)).href);
  }

  if (rule.urlTemplate?.trim()) {
    const expanded = expandTemplate(rule.urlTemplate.trim(), vars);
    return normalizeOriginUri(expanded);
  }

  return null;
}

function parseEntriesObject(
  raw: unknown,
  sourceLabel: string,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${sourceLabel}: "entries" must be an object of path → URI`);
  }
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim();
    if (!key || typeof v !== "string" || !v.trim()) continue;
    entries[key] = v.trim();
  }
  return Object.keys(entries).length > 0 ? entries : undefined;
}

export function parseOriginRuleJson(raw: string, sourceLabel: string): OriginRule {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${sourceLabel}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object`);
  }
  const o = parsed as Record<string, unknown>;
  const rule: OriginRule = {};
  if (typeof o.pattern === "string") rule.pattern = o.pattern;
  if (typeof o.urlTemplate === "string") rule.urlTemplate = o.urlTemplate;
  if (o.file === true) rule.file = true;
  if (Array.isArray(o.include)) {
    rule.include = o.include.filter((x): x is string => typeof x === "string");
  }
  if ("entries" in o) {
    rule.entries = parseEntriesObject(o.entries, sourceLabel);
  }
  if (!rule.file && !rule.urlTemplate && !rule.entries) {
    throw new Error(
      `${sourceLabel} must set "entries", "urlTemplate", and/or "file": true`,
    );
  }
  return rule;
}

/**
 * Parse a file→URL list document.
 * Lines: `#` comments, blanks ignored; `path-or-name<TAB>url` or `path-or-name url`.
 */
export function parseOriginEntriesTsv(
  raw: string,
  sourceLabel: string,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tab = trimmed.indexOf("\t");
    let key: string;
    let uri: string;
    if (tab >= 0) {
      key = trimmed.slice(0, tab).trim();
      uri = trimmed.slice(tab + 1).trim();
    } else {
      const m = /^(\S+)\s+(https?:\/\/\S+|file:\S+)$/i.exec(trimmed);
      if (!m) {
        throw new Error(
          `${sourceLabel}: expected "file\\turl" (got: ${trimmed})`,
        );
      }
      key = m[1]!;
      uri = m[2]!;
    }
    if (!key || !uri) {
      throw new Error(`${sourceLabel}: empty path or URI on line: ${trimmed}`);
    }
    entries[key] = uri;
  }
  if (Object.keys(entries).length === 0) {
    throw new Error(`${sourceLabel} has no file→URL rows`);
  }
  return entries;
}

/** Load `.zipwiki-origins.json` and/or `.zipwiki-origins.tsv` for a directory. */
export function readDirOriginRule(dir: string): OriginRule | null {
  const jsonPath = joinPath(dir, ORIGINS_RULE_FILENAME);
  const tsvPath = joinPath(dir, ORIGINS_TSV_FILENAME);
  let rule: OriginRule | null = null;
  let tsvEntries: Record<string, string> | undefined;

  if (existsSync(tsvPath)) {
    tsvEntries = parseOriginEntriesTsv(readFileSync(tsvPath, "utf-8"), tsvPath);
  }
  if (existsSync(jsonPath)) {
    rule = parseOriginRuleJson(readFileSync(jsonPath, "utf-8"), jsonPath);
  }

  if (tsvEntries) {
    if (!rule) return { entries: tsvEntries };
    rule = {
      ...rule,
      entries: { ...tsvEntries, ...(rule.entries ?? {}) },
    };
  }
  return rule;
}

function joinPath(dir: string, name: string): string {
  return resolve(dir, name);
}

/** Read sidecar URI next to a document, or null if absent. */
export function readOriginSidecar(fileAbs: string): string | null {
  const urlSide = `${fileAbs}.url`;
  const jsonSide = `${fileAbs}.origin.json`;
  if (existsSync(urlSide)) {
    const line = readFileSync(urlSide, "utf-8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    if (!line) return null;
    return normalizeOriginUri(line);
  }
  if (existsSync(jsonSide)) {
    const raw = JSON.parse(readFileSync(jsonSide, "utf-8")) as {
      uri?: unknown;
      url?: unknown;
    };
    const uri =
      typeof raw.uri === "string"
        ? raw.uri
        : typeof raw.url === "string"
          ? raw.url
          : null;
    if (!uri) {
      throw new Error(`${jsonSide} must contain "uri" (or "url")`);
    }
    return normalizeOriginUri(uri);
  }
  return null;
}

const DRIVE_ITEM_ID_ATTR = "com.google.drivefs.item-id#S";

/** Google Drive for desktop file id, when the pack flag asks for it. */
export function driveFileOriginUri(fileAbs: string): string | null {
  if (process.platform !== "darwin") return null;
  const result = spawnSync("xattr", ["-p", DRIVE_ITEM_ID_ATTR, fileAbs], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const id = (result.stdout ?? "").trim();
  if (!id) return null;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

/**
 * Resolve the origin URI for one source file at pack time.
 * Returns null when no rule/sidecar matches (omit 0x014F).
 */
export function resolveOriginUri(
  fileAbs: string,
  opts: ResolveOriginOptions,
): string | null {
  const abs = resolve(fileAbs);
  const root = containingRoot(abs, opts.inputRoots);
  if (!root) {
    const sidecar = readOriginSidecar(abs);
    if (sidecar) return sidecar;
    if (opts.originDrive) return driveFileOriginUri(abs);
    return null;
  }

  const sidecar = readOriginSidecar(abs);
  if (sidecar) return sidecar;

  if (opts.originDrive) {
    const drive = driveFileOriginUri(abs);
    if (drive) return drive;
  }

  const chain: string[] = [];
  let dir = dirname(abs);
  for (;;) {
    chain.push(dir);
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const d of chain) {
    const rule = readDirOriginRule(d);
    if (!rule) continue;
    const uri = tryApplyOriginRule(rule, abs, d);
    if (uri) return uri;
  }

  if (opts.cliOverlay) {
    const uri = tryApplyOriginRule(opts.cliOverlay, abs, root);
    if (uri) return uri;
  }

  return null;
}

/**
 * Load a pack-input origins list from `--origins <path>`.
 * `.json` → full rule object; otherwise → TSV/space-separated file→URL rows.
 */
export function loadOriginListFile(filePath: string): OriginRule {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`Origins list not found: ${filePath}`);
  }
  const raw = readFileSync(abs, "utf-8");
  if (abs.toLowerCase().endsWith(".json")) {
    return parseOriginRuleJson(raw, abs);
  }
  return { entries: parseOriginEntriesTsv(raw, abs) };
}

/** Build a CLI overlay rule from pack flags (null if nothing set). */
export function cliOriginOverlay(input: {
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  /** Entries from `--origins` (and/or merged rule fields). */
  originEntries?: Record<string, string>;
}): OriginRule | null {
  const pattern = input.originPattern?.trim();
  const urlTemplate = input.originUrlTemplate?.trim();
  const file = input.originFile === true;
  const entries =
    input.originEntries && Object.keys(input.originEntries).length > 0
      ? input.originEntries
      : undefined;
  if (!pattern && !urlTemplate && !file && !entries) return null;
  if (!file && !urlTemplate && !entries) {
    throw new Error(
      "--origin-pattern requires --origin-url-template, --origin-file, or --origins",
    );
  }
  return {
    ...(pattern ? { pattern } : {}),
    ...(urlTemplate ? { urlTemplate } : {}),
    ...(file ? { file: true } : {}),
    ...(entries ? { entries } : {}),
  };
}
