/** One primary member described by package-level OKF. */
export type OkfPrimaryRef = {
  /** Zip entry path of the primary (e.g. `report.pdf`). */
  path: string;
  documentType?: string;
  digest?: string;
  contentSha256?: string;
};

export type OkfSourceRef = {
  id?: string;
  resource: string;
  description?: string;
};

/** LLM (or test-injected) enrichment for the package concept. */
export type OkfEnrichment = {
  title: string;
  description: string;
  /** OKF concept `type` (e.g. Invoice, Contract, Spreadsheet, Document). */
  type: string;
  /** Always emitted after normalize (AI and fallback). */
  tags?: string[];
  /** 3–8 skim bullets for `# Key facts` (optional; usually AI). */
  keyFacts?: string[];
  /** Section / topic map for `# Contents` (optional; usually AI). */
  contents?: string[];
  /** @deprecated Prefer keyFacts + contents; freeform body is no longer emitted. */
  bodyMarkdown?: string;
  details?: Record<string, string>;
  keyTerms?: Record<string, string>;
  schemaColumns?: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
};

export type BuildOkfBundleInput = {
  title?: string;
  digest?: string;
  documentType?: string;
  primaries: OkfPrimaryRef[];
  /** LiteParse markdown sample for AI context. */
  parsedMarkdown?: string;
  aiRoot?: string;
  /** Prefer AI when credentials exist (default true). */
  useAi?: boolean;
  /**
   * When true with `useAi`, fail instead of falling back if the LLM is
   * missing credentials or the enrichment call errors.
   */
  requireAi?: boolean;
  /** LLM supplier: openai | anthropic | gemini | openrouter | openai-compatible | ai-gateway. */
  provider?: string;
  /** Inject enrichment (tests); skips live network. */
  enrichment?: OkfEnrichment;
  model?: string;
  generatedBy?: string;
  generatedAt?: string;
  /** Override code-owned sources. */
  sources?: OkfSourceRef[];
  logAction?: string;
  /**
   * When set, overrides the concept filename. Standalone OKF uses `{stem}.md`.
   * Pack multi-primary defaults to `document.md`.
   */
  conceptFileName?: string;
  /**
   * Emit bundle-root `index.md` listing this concept (default true).
   * Standalone multi-file OKF sets false and writes a combined index after.
   */
  includeIndex?: boolean;
  /** @deprecated Ignored — OKF concepts are frontmatter-only. */
  conceptBody?: string;
};

/** Single-document OKF (dev CLI / per-file bundles). */
export type BuildOkfDocumentInput = {
  /** Basename or relative path used as the primary id (e.g. `report.pdf`). */
  sourceName: string;
  /** Absolute or display path for digests / logs. */
  sourcePath?: string;
  /**
   * Parsed markdown for AI context. When empty/missing (parse failed), OKF
   * still builds from filename / type — LLM may summarize from that alone.
   */
  parsedMarkdown?: string;
  documentType?: string;
  title?: string;
  digest?: string;
  contentSha256?: string;
  useAi?: boolean;
  /** Fail instead of deterministic fallback when AI enrichment is required. */
  requireAi?: boolean;
  enrichment?: OkfEnrichment;
  /** LLM supplier id (see OkfProviderId). */
  provider?: string;
  model?: string;
  generatedBy?: string;
  generatedAt?: string;
  /**
   * Code-owned source entries relative to the OKF output directory
   * (e.g. `../sample-docs/a.pdf`).
   */
  sources: OkfSourceRef[];
};

export type OkfFile = {
  /** Relative to `{aiRoot}/okf/` — e.g. `index.md`. */
  name: string;
  data: string;
};

export type OkfBuildResult = {
  files: OkfFile[];
  mode: "ai" | "fallback";
  digest: string;
  title: string;
  conceptType: string;
  /** When mode is fallback after a failed AI attempt, truncated error. */
  aiError?: string;
};
