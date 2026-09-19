/**
 * zipaccess — open, search, and read portable `.zipwiki` knowledge packages.
 */
export { DEFAULT_MAX_BYTES, clipUtf8, clipBytes, bufferLooksUtf8 } from "./clip.js";
export {
  AccessError,
  DEFAULT_PACKAGE_NAME,
  normalizeEntryName,
  resolvePackagePath,
  rethrowAccess,
} from "./resolve.js";
export {
  OPEN_SEQUENCE,
  openPackage,
  listPackage,
  readOkfIndex,
  readOkf,
  readParsed,
  readEntry,
  readEntries,
  readManifest,
  formatReadStdout,
  zipwikiReadBegin,
  zipwikiReadEnd,
  type OpenResult,
  type ListResult,
  type ReadResult,
} from "./open.js";
export {
  CATALOG_RESULT_FIELDS,
  CATALOG_ROW_FIELDS,
  buildCatalog,
  formatCatalogText,
  formatSearchText,
  readHintsForSearchHit,
  type CatalogResult,
  type CatalogRow,
  type CatalogReadHints,
  type SearchHitWithHints,
} from "./catalog.js";
export {
  searchPackage,
  type SearchHit,
  type SearchResult,
  type SearchScope,
} from "./search.js";
export {
  enrichOkf,
  type EnrichOkfArgs,
  type EnrichOkfResult,
} from "./enrich.js";
export {
  parseUpdateSpecs,
  updatePackage,
  type UpdateSpec,
  type UpdateIngestHooks,
  type UpdatePackageInput,
  type UpdatePackageResult,
} from "./update.js";
export {
  defaultExtractRoot,
  extractEntries,
  readExtractedFile,
  type ExtractedFile,
  type ExtractResult,
} from "./extract.js";
export {
  DEFAULT_MAX_ORIGIN_BYTES,
  entryHasOrigin,
  extractWithOrigin,
  fetchOrigin,
  lookupOrigin,
  originFromEntries,
  primaryPathFromParsed,
  type OriginCheck,
  type OriginFetchResult,
  type OriginSummary,
} from "./origin.js";
