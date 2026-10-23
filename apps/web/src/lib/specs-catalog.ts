import neozipAppnote from "@public-specs/NEOZIP_APPNOTE.md?raw";
import okfProducer from "@public-specs/OKF_ZIPWIKI_VS_SPEC.md?raw";
import okfSpec from "@public-specs/OKF_SPEC.md?raw";
import zipwikiAppnote from "@public-specs/ZIPWIKI_APPNOTE.md?raw";
import {
  NEOZIP_APPNOTE_SOURCE_URL,
  NEOZIP_APPNOTE_URL,
  OKF_PRODUCER_PROFILE_SOURCE_URL,
  OKF_PRODUCER_PROFILE_URL,
  OKF_SPEC_SOURCE_URL,
  OKF_SPEC_URL,
  ZIPWIKI_APPNOTE_SOURCE_URL,
  ZIPWIKI_APPNOTE_URL,
} from "./docs-urls";

export type SpecDoc = {
  slug: string;
  title: string;
  description: string;
  /** Site path for the rendered page. */
  href: string;
  /** Public GitHub blob URL for the raw markdown. */
  sourceUrl: string;
  /** Filename in NeoWareInc/format-specs. */
  filename: string;
  markdown: string;
};

/**
 * Rewrite relative .md links in synced public-specs files to in-app /docs routes
 * so the rendered site stays navigable. OKF v0.2 is kept in the public repo only —
 * site links go to the GitHub source, not a /docs page.
 */
export function rewriteSpecMarkdownLinks(markdown: string): string {
  return markdown
    .replace(/\]\(\.\/ZIPWIKI_APPNOTE\.md\)/g, `](${ZIPWIKI_APPNOTE_URL})`)
    .replace(/\]\(\.\/NEOZIP_APPNOTE\.md\)/g, `](${NEOZIP_APPNOTE_URL})`)
    .replace(/\]\(\.\/OKF_SPEC\.md\)/g, `](${OKF_SPEC_SOURCE_URL})`)
    .replace(
      /\]\(\.\/OKF_ZIPWIKI_VS_SPEC\.md\)/g,
      `](${OKF_PRODUCER_PROFILE_URL})`,
    );
}

/** Every synced format spec (including ones not listed on the site). */
export const ALL_SPEC_DOCS: readonly SpecDoc[] = [
  {
    slug: "zipwiki-appnote",
    title: "ZipWiki Application Note",
    description:
      "Producer and layout profile for .zipwiki — META-INF/manifest.json, wiki/parsed/, wiki/okf/, omit-original policy, and Extra Field 0x014F.",
    href: ZIPWIKI_APPNOTE_URL,
    sourceUrl: ZIPWIKI_APPNOTE_SOURCE_URL,
    filename: "ZIPWIKI_APPNOTE.md",
    markdown: zipwikiAppnote,
  },
  {
    slug: "neozip-appnote",
    title: "NeoZip Application Note",
    description:
      "Parent wire-format profile (.nzip) extending PKWARE APPNOTE 6.3.10 with zstd compression, integrity Extra Fields, and reserved namespaces.",
    href: NEOZIP_APPNOTE_URL,
    sourceUrl: NEOZIP_APPNOTE_SOURCE_URL,
    filename: "NEOZIP_APPNOTE.md",
    markdown: neozipAppnote,
  },
  {
    slug: "okf",
    title: "Open Knowledge Format (OKF v0.2)",
    description:
      "Semantic concept cards, YAML frontmatter fields, key facts, and topic rollup pages stored inside wiki/okf/.",
    href: OKF_SPEC_URL,
    sourceUrl: OKF_SPEC_SOURCE_URL,
    filename: "OKF_SPEC.md",
    markdown: okfSpec,
  },
  {
    slug: "okf-producer",
    title: "ZipWiki OKF Producer Profile",
    description:
      "Field-by-field matrix comparing general OKF v0.2 bundles with ZipWiki’s per-document concept cards and topic rollups.",
    href: OKF_PRODUCER_PROFILE_URL,
    sourceUrl: OKF_PRODUCER_PROFILE_SOURCE_URL,
    filename: "OKF_ZIPWIKI_VS_SPEC.md",
    markdown: okfProducer,
  },
] as const;

/** Specs shown on /docs and reachable at /docs/:slug. */
export const SPEC_DOCS: readonly SpecDoc[] = ALL_SPEC_DOCS.filter(
  (doc) => doc.slug !== "okf",
);

export function getSpecDoc(slug: string): SpecDoc | undefined {
  return SPEC_DOCS.find((doc) => doc.slug === slug);
}
