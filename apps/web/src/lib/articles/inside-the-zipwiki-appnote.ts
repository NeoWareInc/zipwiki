import type { ResourceArticle } from "./types";

/** Draft — not listed on the public Resources page yet. */
export const insideTheZipwikiAppnote: ResourceArticle = {
  slug: "inside-the-zipwiki-appnote",
  title:
    "Inside the ZipWiki Application Note: How .zipwiki Extends NeoZip and PKWARE APPNOTE",
  excerpt:
    "A technical tour of the ZipWiki Application Note (0.2.0-draft): reserved namespaces, manifest.json ai schemas, Extra Field 0x014F origin locators, and strict ZIP compatibility.",
  date: "October 20, 2026",
  category: "Specification",
  readTimeMinutes: 7,
  sections: [
    {
      heading: "Layered on PKWARE APPNOTE 6.3.10 and NeoZip 0.2",
      paragraphs: [
        "The ZipWiki Application Note defines how zipwiki writes—and how zipaccess and MCP tools read—AI knowledge materials inside a NeoZip container. Every .zipwiki file is a compliant ZIP archive per PKWARE APPNOTE 6.3.10 and a valid NeoZip profile archive.",
        "Stock unzip tools can list and extract a .zipwiki without special plugins. Readers that do not recognize ZipWiki's extra fields or META-INF/manifest.json simply ignore them per APPNOTE §4.5 and §4.6.",
      ],
    },
    {
      heading: "Two reserved namespaces: META-INF/ and wiki/",
      paragraphs: [
        "Rather than scattering sidecar files alongside user documents, the Application Note reserves two top-level namespaces:",
      ],
      bullets: [
        "META-INF/ holds package-level control metadata, starting with META-INF/manifest.json (format: \"neozip\", specVersion: \"0.2\", and the ai registry).",
        "wiki/ (the default AI root) holds all generated knowledge artifacts: wiki/parsed/<relpath>.md for extracted document text and wiki/okf/ for Open Knowledge Format cards and topic pages.",
        "Clean index invariant: ZipWiki writes markdown concept cards, wiki/okf/index.md, and multi-card topic pages under wiki/okf/topics/, keeping the archive free of redundant search blobs or execution logs.",
      ],
      code: {
        caption: "META-INF/manifest.json — ai object excerpt",
        snippet: `{
  "format": "neozip",
  "specVersion": "0.2",
  "ai": {
    "root": "wiki",
    "documents": 28,
    "parsed": 28,
    "digest": "28 documents: 2025 SEC Form 10-K and Form 10-Q filings across seven public companies...",
    "okf": {
      "version": "0.2",
      "index": "wiki/okf/index.md",
      "concepts": 28
    }
  }
}`,
      },
    },
    {
      heading: "Extra Field 0x014F: Origin links and CRC-32 verification",
      paragraphs: [
        "When an archive is packed with --omit-original, each document's central directory record and OKF card can carry its canonical source URL alongside the original file's CRC-32 and uncompressed size.",
        "At query or extract time, zipwiki origin --fetch downloads the remote file and checks its CRC-32 against the recorded checksum, proving that the external PDF or document matches the exact bytes that were parsed at pack time.",
      ],
    },
  ],
};
