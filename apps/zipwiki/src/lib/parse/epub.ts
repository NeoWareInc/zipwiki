import { basename } from "node:path";
import { listZipEntries, readZipEntry } from "../archive/zip-list.js";
import type { DocumentParseResult } from "./types.js";

const HTML_EXT = /\.(xhtml|html|htm)$/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/** Gutenberg and other EPUB HTML, reduced to markdown-ish text. */
export function htmlToMarkdown(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, level: string) => {
      const n = Number(level);
      return `\n\n${"#".repeat(Number.isFinite(n) ? n : 1)} `;
    })
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section)>/gi, "\n");
  text = decodeEntities(text.replace(/<[^>]+>/g, ""));
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hrefBase(href: string): string {
  const path = href.split("#")[0]?.split("?")[0] ?? href;
  return decodeURIComponent(path).replace(/\\/g, "/");
}

function spineOrder(opf: string): string[] {
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(
    /<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  )) {
    manifest.set(match[1]!, hrefBase(match[2]!));
  }
  for (const match of opf.matchAll(
    /<item\b[^>]*\bhref=["']([^"']+)["'][^>]*\bid=["']([^"']+)["'][^>]*>/gi,
  )) {
    if (!manifest.has(match[2]!)) manifest.set(match[2]!, hrefBase(match[1]!));
  }
  const order: string[] = [];
  for (const match of opf.matchAll(
    /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*\/?>/gi,
  )) {
    const href = manifest.get(match[1]!);
    if (href) order.push(href);
  }
  return order;
}

function isContentHtml(name: string): boolean {
  const base = basename(name).toLowerCase();
  if (!HTML_EXT.test(base)) return false;
  if (base.includes("toc") || base.includes("nav") || base.startsWith("wrap")) {
    return false;
  }
  return true;
}

/**
 * Read an EPUB (ZIP of XHTML) into one markdown document.
 * LiteParse and LlamaParse do not read EPUB, so pack uses this extract.
 */
export function parseEpub(epubPath: string): DocumentParseResult {
  const entries = listZipEntries(epubPath);
  const byName = new Map(entries.map((entry) => [entry.name.replace(/\\/g, "/"), entry]));
  const opf = entries.find((entry) => entry.name.toLowerCase().endsWith(".opf"));
  const ordered = opf
    ? spineOrder(readZipEntry(epubPath, opf.name).toString("utf8"))
    : [];

  const htmlNames = entries
    .map((entry) => entry.name.replace(/\\/g, "/"))
    .filter(isContentHtml);
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const href of ordered) {
    const hit =
      htmlNames.find((name) => name === href || name.endsWith(`/${href}`)) ??
      null;
    if (!hit || seen.has(hit) || !byName.has(hit)) continue;
    seen.add(hit);
    chosen.push(hit);
  }
  for (const name of htmlNames.sort((a, b) => a.localeCompare(b))) {
    if (seen.has(name)) continue;
    seen.add(name);
    chosen.push(name);
  }

  const parts: string[] = [];
  for (const name of chosen) {
    const html = readZipEntry(epubPath, name).toString("utf8");
    const text = htmlToMarkdown(html);
    if (text) parts.push(text);
  }
  const text = parts.join("\n\n").trim();
  if (!text) {
    throw new Error(`No readable text in EPUB: ${basename(epubPath)}`);
  }
  return {
    engine: "liteparse",
    text,
    pages: [{ pageNum: 1, text, markdown: text }],
    route: { mode: "fixed", reason: "epub xhtml extract" },
  };
}
