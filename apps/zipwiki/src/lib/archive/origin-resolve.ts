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

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ORIGIN_URI_MAX_BYTES } from "./origin-extra.js";

export const ORIGINS_RULE_FILENAME = ".zipwiki-origins.json";

export type OriginRule = {
  /** Optional filename regex; named groups fill urlTemplate. Fall through if no match. */
  pattern?: string;
  /** Absolute URI template with {name}, {path}, {dir}, and pattern group names. */
  urlTemplate?: string;
  /** When true, locator is pathToFileURL(absolute file). */
  file?: boolean;
  /** Optional globs (basename or path relative to rule dir); non-match → fall through. */
  include?: string[];
};

export type ResolveOriginOptions = {
  /** Absolute pack input roots; rules do not walk above the containing root. */
  inputRoots: string[];
  /** Virtual rule applied at each input root when no directory rule matched. */
  cliOverlay?: OriginRule | null;
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
  if (!rule.file && !rule.urlTemplate) {
    throw new Error(
      `${sourceLabel} must set "urlTemplate" and/or "file": true`,
    );
  }
  return rule;
}

function readRuleFile(dir: string): OriginRule | null {
  const path = joinPath(dir, ORIGINS_RULE_FILENAME);
  if (!existsSync(path)) return null;
  return parseOriginRuleJson(readFileSync(path, "utf-8"), path);
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
    // No known pack root — still allow sidecar next to the file.
    return readOriginSidecar(abs);
  }

  const sidecar = readOriginSidecar(abs);
  if (sidecar) return sidecar;

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
    const rule = readRuleFile(d);
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

/** Build a CLI overlay rule from pack flags (null if neither flag set). */
export function cliOriginOverlay(input: {
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
}): OriginRule | null {
  const pattern = input.originPattern?.trim();
  const urlTemplate = input.originUrlTemplate?.trim();
  const file = input.originFile === true;
  if (!pattern && !urlTemplate && !file) return null;
  if (!file && !urlTemplate) {
    throw new Error(
      "--origin-pattern requires --origin-url-template (or --origin-file)",
    );
  }
  return {
    ...(pattern ? { pattern } : {}),
    ...(urlTemplate ? { urlTemplate } : {}),
    ...(file ? { file: true } : {}),
  };
}
