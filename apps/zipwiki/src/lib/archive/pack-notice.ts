/**
 * Optional pack-input notice. A file named `.zipwiki-notice.md` in a pack
 * folder is not a document. Pack copies its text into `ai.notice` and the
 * top of `wiki/okf/index.md`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PACK_NOTICE_FILENAME = ".zipwiki-notice.md";
/** Manifest field cap. Longer source text is cut at the last space before this. */
export const PACK_NOTICE_MAX_CHARS = 500;

export function readPackNotice(roots: string[]): string | undefined {
  for (const root of roots) {
    const path = join(root, PACK_NOTICE_FILENAME);
    if (!existsSync(path)) continue;
    const text = normalizeNotice(readFileSync(path, "utf8"));
    if (text) return text;
  }
  return undefined;
}

export function normalizeNotice(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= PACK_NOTICE_MAX_CHARS) return text;
  const cut = text.slice(0, PACK_NOTICE_MAX_CHARS);
  const space = cut.lastIndexOf(" ");
  return (space > 80 ? cut.slice(0, space) : cut).trimEnd();
}

/** Place the notice after OKF frontmatter and before `# Files`. */
export function indexWithNotice(markdown: string, notice: string): string {
  const text = notice.trim();
  if (!text) return markdown;
  const files = markdown.search(/^# Files\s*$/m);
  const block = `${text}\n\n`;
  if (files < 0) return `${markdown.trimEnd()}\n\n${block}`;
  return `${markdown.slice(0, files)}${block}${markdown.slice(files)}`;
}
