/**
 * Build package-level `ai.digest` from OKF index / concept descriptions.
 * Local only — no LLM call.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  indexEntryFromConceptMarkdown,
  OKF_INDEX_NAME,
  OKF_LOG_NAME,
  OKF_TOPICS_DIR,
  type OkfIndexEntry,
} from "./render.js";

/** Soft cap for the one-line package summary (APPNOTE §5). */
export const PACKAGE_DIGEST_MAX_CHARS = 280;

const FILES_HEADING = /^#\s+Files\s*$/i;
const TOPICS_HEADING = /^#\s+/;
/** `* [Title](href) - description` or `* [Title](href)` */
const INDEX_BULLET =
  /^\*\s+\[([^\]]*)\]\(([^)]+)\)(?:\s+-\s+(.+))?\s*$/;

/**
 * Parse `# Files` bullets from a rendered OKF `index.md`.
 * Stops at the next `#` heading (e.g. `# Topics`).
 */
export function parseOkfIndexFileEntries(indexMarkdown: string): OkfIndexEntry[] {
  const lines = indexMarkdown.split(/\r?\n/);
  let inFiles = false;
  const entries: OkfIndexEntry[] = [];
  for (const line of lines) {
    if (FILES_HEADING.test(line.trim())) {
      inFiles = true;
      continue;
    }
    if (!inFiles) continue;
    if (TOPICS_HEADING.test(line.trim()) && !FILES_HEADING.test(line.trim())) {
      break;
    }
    const m = INDEX_BULLET.exec(line.trim());
    if (!m) continue;
    const title = (m[1] ?? "").trim();
    const href = (m[2] ?? "").trim().replace(/\\/g, "/");
    const description = m[3]?.trim();
    if (!href || href === "*(none)*") continue;
    if (title === "*(none)*") continue;
    entries.push({
      href,
      title: title || href.replace(/\.md$/i, ""),
      ...(description ? { description } : {}),
    });
  }
  return entries;
}

/** Load concept cards from an OKF directory (skips index, log, topics). */
export function loadOkfConceptEntriesFromDir(okfDir: string): OkfIndexEntry[] {
  if (!existsSync(okfDir)) return [];
  const entries: OkfIndexEntry[] = [];
  for (const name of readdirSync(okfDir).sort()) {
    if (!name.endsWith(".md")) continue;
    if (name === OKF_INDEX_NAME || name === OKF_LOG_NAME) continue;
    const path = join(okfDir, name);
    if (!statSync(path).isFile()) continue;
    entries.push(
      indexEntryFromConceptMarkdown(name, readFileSync(path, "utf-8")),
    );
  }
  return entries;
}

/**
 * Build digest lines from index entries (description preferred, else title).
 */
export function synthesizePackageDigestFromEntries(
  entries: OkfIndexEntry[],
  maxChars = PACKAGE_DIGEST_MAX_CHARS,
): string | undefined {
  const parts: string[] = [];
  for (const e of entries) {
    const text = (e.description?.trim() || e.title?.trim() || "").replace(
      /\s+/g,
      " ",
    );
    if (!text || text === "*(none)*") continue;
    parts.push(text);
  }
  if (parts.length === 0) return undefined;

  const n = parts.length;
  const prefix = `${n} document${n === 1 ? "" : "s"}: `;
  let body = parts.join("; ");
  let out = prefix + body;
  if (out.length <= maxChars) return out;

  // Truncate body to fit, prefer cutting at a semicolon boundary.
  const budget = maxChars - prefix.length;
  if (budget < 16) return out.slice(0, maxChars - 1).trimEnd() + "…";
  if (body.length > budget) {
    let cut = body.lastIndexOf("; ", budget - 1);
    if (cut < budget * 0.4) cut = budget - 1;
    body = body.slice(0, cut).trimEnd() + "…";
  }
  return prefix + body;
}

/**
 * Prefer `index.md` `# Files` rows; else each concept's frontmatter.
 * Returns undefined when there is nothing useful to summarize.
 */
export function synthesizePackageDigestFromOkfDir(
  okfDir: string,
  maxChars = PACKAGE_DIGEST_MAX_CHARS,
): string | undefined {
  if (!existsSync(okfDir)) return undefined;
  const indexPath = join(okfDir, OKF_INDEX_NAME);
  let entries: OkfIndexEntry[] = [];
  if (existsSync(indexPath) && statSync(indexPath).isFile()) {
    entries = parseOkfIndexFileEntries(readFileSync(indexPath, "utf-8"));
  }
  if (entries.length === 0) {
    entries = loadOkfConceptEntriesFromDir(okfDir);
  }
  return synthesizePackageDigestFromEntries(entries, maxChars);
}

/**
 * Same synthesizer for in-archive OKF files (update path).
 * `files` names are relative to the OKF root (e.g. `index.md`, `note.md`).
 */
export function synthesizePackageDigestFromOkfFiles(
  files: Array<{ name: string; data: string }>,
  maxChars = PACKAGE_DIGEST_MAX_CHARS,
): string | undefined {
  const byName = new Map(
    files.map((f) => [f.name.replace(/\\/g, "/"), f.data] as const),
  );
  const indexData = byName.get(OKF_INDEX_NAME);
  let entries: OkfIndexEntry[] = [];
  if (indexData) {
    entries = parseOkfIndexFileEntries(indexData);
  }
  if (entries.length === 0) {
    for (const [name, data] of [...byName.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "en"),
    )) {
      if (!name.endsWith(".md")) continue;
      if (name === OKF_INDEX_NAME || name === OKF_LOG_NAME) continue;
      if (name.startsWith(`${OKF_TOPICS_DIR}/`) || name.includes("/")) continue;
      entries.push(indexEntryFromConceptMarkdown(name, data));
    }
  }
  return synthesizePackageDigestFromEntries(entries, maxChars);
}
