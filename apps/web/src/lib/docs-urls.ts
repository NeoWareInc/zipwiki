/**
 * Hybrid public specs:
 * - Rendered pages on zipwiki.ai (/docs/…)
 * - Canonical raw markdown in the public NeoWareInc/format-specs repo
 *
 * The ZipWiki product repo stays private. Sync with: pnpm sync:public-specs
 */

/** Public GitHub repo that holds the citable markdown (not the private zipwiki app). */
export const FORMAT_SPECS_REPO = "NeoWareInc/format-specs";

export const FORMAT_SPECS_REPO_URL = `https://github.com/${FORMAT_SPECS_REPO}`;

export const FORMAT_SPECS_BLOB_BASE = `${FORMAT_SPECS_REPO_URL}/blob/main`;

/** Pretty rendered pages on this site (and safe for NeoZip.io to deep-link). */
export const ZIPWIKI_APPNOTE_URL = "/docs/zipwiki-appnote";
export const NEOZIP_APPNOTE_URL = "/docs/neozip-appnote";
export const OKF_SPEC_URL = "/docs/okf";
export const OKF_PRODUCER_PROFILE_URL = "/docs/okf-producer";

export const DOCS_INDEX_URL = "/docs";

/** Canonical raw markdown (public format-specs repo). */
export const ZIPWIKI_APPNOTE_SOURCE_URL = `${FORMAT_SPECS_BLOB_BASE}/ZIPWIKI_APPNOTE.md`;
export const NEOZIP_APPNOTE_SOURCE_URL = `${FORMAT_SPECS_BLOB_BASE}/NEOZIP_APPNOTE.md`;
export const OKF_SPEC_SOURCE_URL = `${FORMAT_SPECS_BLOB_BASE}/OKF_SPEC.md`;
export const OKF_PRODUCER_PROFILE_SOURCE_URL = `${FORMAT_SPECS_BLOB_BASE}/OKF_ZIPWIKI_VS_SPEC.md`;

export const OKF_SPEC_LINK_LABEL = "Open Knowledge Format documentation";
