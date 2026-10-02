import { basename, extname } from "node:path";
import { listZipEntries, readZipEntry } from "../archive/zip-list.js";
import { imageModeFrom, type ImageMode } from "./config.js";
import type { DocumentParseResult, ParsedImage } from "./types.js";

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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg)$/i;

export type EpubParseOptions = {
  /** Same values as LiteParse `imageMode`. Default `placeholder`. */
  imageMode?: string;
  /** Keep figure bytes on the parse result. Pack stores them as `.assets/`. */
  extractImages?: boolean;
};

function tagAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i",
    ),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? decodeEntities(value).trim() : undefined;
}

function imageHref(attrs: string): string | undefined {
  return (
    tagAttr(attrs, "src") ??
    tagAttr(attrs, "xlink:href") ??
    tagAttr(attrs, "href")
  );
}

function resolveZipPath(fromFile: string, href: string): string | null {
  const raw = href.split("#")[0]?.split("?")[0] ?? "";
  if (!raw || raw.startsWith("data:") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return null;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const parts = fromFile.split("/").slice(0, -1);
  for (const part of decoded.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const joined = parts.join("/");
  return joined || null;
}

function mimeForImage(name: string): string {
  switch (extname(name).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

function markdownAlt(attrs: string, fileName: string): string {
  const alt = (tagAttr(attrs, "alt") ?? "")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (alt) return alt;
  return basename(fileName).replace(/\.[^.]+$/, "") || "image";
}

function uniqueImageName(srcPath: string, used: Set<string>): string {
  const cleaned =
    srcPath
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .join("_")
      .replace(/[^A-Za-z0-9._-]+/g, "_") || "image";
  const ext = extname(cleaned);
  const stem = ext ? cleaned.slice(0, -ext.length) : cleaned;
  let name = cleaned;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${stem}_${n}${ext}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * Replace `<img>` / `<image>` before the generic tag strip.
 * `placeholder` leaves a markdown image. `embed` inlines a data URI.
 * `extractImages` keeps the bytes; pack retargets the href into `.assets/`.
 */
function replaceEpubImages(
  html: string,
  htmlName: string,
  byName: Map<string, { name: string }>,
  read: (name: string) => Buffer,
  mode: ImageMode,
  extractImages: boolean,
  images: ParsedImage[],
  usedNames: Set<string>,
  named: Map<string, string>,
): string {
  const emit = (attrs: string): string => {
    if (mode === "off") return "";
    const href = imageHref(attrs);
    if (!href) return "";
    if (href.startsWith("data:")) {
      return mode === "embed"
        ? `\n\n![${markdownAlt(attrs, "image")}](${href})\n\n`
        : `\n\n![${markdownAlt(attrs, "image")}](inline-image)\n\n`;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return `\n\n![${markdownAlt(attrs, "image")}](${href})\n\n`;
    }
    const resolved = resolveZipPath(htmlName, href);
    const entryName = resolved
      ? [...byName.keys()].find((name) => name.toLowerCase() === resolved.toLowerCase())
      : undefined;
    if (!entryName || !IMAGE_EXT.test(entryName)) {
      const label = basename(href.split("?")[0] ?? href) || "image";
      return `\n\n![${markdownAlt(attrs, label)}](${label})\n\n`;
    }
    let fileName = named.get(entryName);
    if (!fileName) {
      fileName = uniqueImageName(entryName, usedNames);
      named.set(entryName, fileName);
      if (extractImages) {
        images.push({ name: fileName, bytes: read(byName.get(entryName)!.name) });
      }
    }
    const alt = markdownAlt(attrs, fileName);
    if (mode === "embed") {
      const bytes = extractImages
        ? images.find((image) => image.name === fileName)?.bytes
        : read(byName.get(entryName)!.name);
      if (!bytes) return `\n\n![${alt}](${fileName})\n\n`;
      const mime = mimeForImage(fileName);
      return `\n\n![${alt}](data:${mime};base64,${bytes.toString("base64")})\n\n`;
    }
    return `\n\n![${alt}](${fileName})\n\n`;
  };
  return html
    .replace(/<img\b([^>]*)>/gi, (_, attrs: string) => emit(attrs))
    .replace(/<image\b([^>]*)>/gi, (_, attrs: string) => emit(attrs));
}

/**
 * Read an EPUB (ZIP of XHTML) into one markdown document.
 * LiteParse and LlamaParse do not read EPUB, so pack uses this extract.
 * Image options match LiteParse: `imageMode` and `extractImages`.
 */
export function parseEpub(
  epubPath: string,
  options: EpubParseOptions = {},
): DocumentParseResult {
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

  const mode = imageModeFrom(options.imageMode);
  const extractImages = options.extractImages === true;
  const images: ParsedImage[] = [];
  const usedNames = new Set<string>();
  const named = new Map<string, string>();
  const parts: string[] = [];
  for (const name of chosen) {
    const html = readZipEntry(epubPath, name).toString("utf8");
    const withImages = replaceEpubImages(
      html,
      name,
      byName,
      (entry) => readZipEntry(epubPath, entry),
      mode,
      extractImages,
      images,
      usedNames,
      named,
    );
    const text = htmlToMarkdown(withImages);
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
    ...(images.length > 0 ? { images } : {}),
    route: { mode: "fixed", reason: "epub xhtml extract" },
  };
}
