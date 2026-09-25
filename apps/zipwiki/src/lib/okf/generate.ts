import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { isRemoteOkfMode, resolveOkfCredentialSource } from "../config/index.js";
import { RemoteOkfAdapter } from "./adapters/remote.js";
import {
  conceptFileNameFor,
  fallbackEnrichment,
  fallbackTags,
  normalizeOkfTags,
  renderOkfFiles,
} from "./render.js";
import {
  createOkfLanguageModel,
  isAiOkfConfigured,
  resolveOkfModel,
  resolveOkfProvider,
} from "./providers.js";
import { okfParseSample } from "./parse-sample.js";
import type {
  BuildOkfBundleInput,
  BuildOkfDocumentInput,
  OkfBuildResult,
  OkfEnrichment,
} from "./types.js";

export {
  DEFAULT_OKF_PROVIDER,
  OKF_PROVIDERS,
  OKF_PROVIDER_CONFIGS,
  createOkfLanguageModel,
  isAiOkfConfigured,
  isOkfProviderId,
  normalizeOkfProvider,
  resolveOkfModel,
  resolveOkfProvider,
  stripProviderPrefix,
  type OkfLanguageModelHandle,
  type OkfProviderConfig,
  type OkfProviderId,
} from "./providers.js";

const enrichmentSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.string(),
  tags: z
    .array(z.string())
    .describe("Short lowercase topical labels, e.g. sec-filing, contract"),
  keyFacts: z
    .array(z.string())
    .describe("Concrete skim facts (parties, dates, amounts, filing type)"),
  contents: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Section / topic map of what is inside the document"),
});

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          const text = row.text ?? row.fact ?? row.value ?? row.name ?? row.title;
          return typeof text === "string" ? text : "";
        }
        return typeof item === "number" ? String(item) : "";
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/** Accept a model JSON object even when a field type misses the strict schema. */
function coerceEnrichment(
  value: unknown,
): z.infer<typeof enrichmentSchema> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const description =
    typeof row.description === "string" ? row.description.trim() : "";
  if (!title || !description) return undefined;
  const contents = asStringList(row.contents);
  return {
    title,
    description,
    type: typeof row.type === "string" && row.type.trim() ? row.type : "Document",
    tags: asStringList(row.tags),
    keyFacts: asStringList(row.keyFacts),
    contents: contents.length > 0 ? contents : undefined,
  };
}

function ensureEnrichmentTags(
  enrichment: OkfEnrichment,
  input: BuildOkfBundleInput,
): OkfEnrichment {
  const primary = input.primaries[0];
  const tags = normalizeOkfTags(
    enrichment.tags ?? [],
    fallbackTags({
      type: enrichment.type,
      documentType: input.documentType ?? primary?.documentType,
      primaryPath: primary?.path,
    }),
  );
  return { ...enrichment, tags };
}

/**
 * Call the configured LLM supplier for OKF enrichment.
 * Throws when credentials are missing or the provider call fails.
 */
export async function fetchOkfEnrichment(
  input: BuildOkfBundleInput,
): Promise<OkfEnrichment> {
  if (!isAiOkfConfigured()) {
    throw new Error(
      "No OKF LLM API key found. Set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_COMPATIBLE_API_KEY, or AI_GATEWAY_API_KEY (see .env.example).",
    );
  }

  const handle = createOkfLanguageModel({
    provider: input.provider,
    model: input.model,
  });

  const primaryList = input.primaries
    .map((p) => `- ${p.path}${p.documentType ? ` [${p.documentType}]` : ""}`)
    .join("\n");
  const parseSample = okfParseSample(input.parsedMarkdown);

  const prompt = [
      "You author Open Knowledge Format (OKF) v0.2 metadata for a ZipWiki document.",
      "Full parse markdown lives in a separate file — do NOT paste or paraphrase long excerpts.",
      "Return title, description, type, tags, keyFacts, and optional contents for ONE concept.",
      "",
      "TYPE MAPPING (choose an appropriate OKF type):",
      "- SEC filings / 10-K / annual reports → Technical Document or Financial Report",
      "- Invoices / receipts → Invoice or Vendor Receipt",
      "- Contracts / NDAs / agreements / deeds → Contract, NDA, Deed, or Service Agreement",
      "- Spreadsheets → Spreadsheet",
      "- Fax / scanned ads / marketing → Document or Advertisement",
      "- Email / .eml → Communication or Email Thread",
      "- Other → Document or Technical Document",
      "",
      "Rules:",
      "- title: concise human-readable title (not just the filename).",
      "- description: a clear 1–2 sentence summary of what the document contains and its purpose (max ~240 chars). Do not quote random checkboxes or boilerplate headers.",
      "- type: one OKF type from the mapping above.",
      "- tags: 2–8 short lowercase labels (hyphenated), e.g. sec-filing, apple, fiscal-2024, warranty-deed.",
      "- keyFacts: 3–8 concrete bullets agents can skim (who/what/when/amounts/jurisdiction). No prose paragraphs.",
      "- contents: optional short list of major sections or topics (e.g. \"Item 1A Risk Factors\", \"Granting clause\").",
      "- Do NOT invent verified, sources, generated, status, stale_after, or resource fields — code owns those.",
      "- Prefer facts extractable from the parsed text; omit uncertain amounts/dates.",
      "- If parse text is missing or only says parse was unavailable, summarize from the filename and type alone — still return title, description, type, tags, and plausible keyFacts (e.g. format, topic hints from the name). Mark uncertainty in description when needed.",
      "",
      `Suggested classifier category: ${input.documentType ?? "Generic"}`,
      `Package title hint: ${input.title ?? "(none)"}`,
      `Existing digest hint: ${input.digest ?? "(none)"}`,
      "Primaries:",
      primaryList || "(none)",
      "",
      "Parsed text sample:",
      parseSample || "(no parse text — filename/type only)",
    ].join("\n");

  let object: z.infer<typeof enrichmentSchema> | undefined;
  try {
    ({ object } = await generateObject({
      model: handle.model,
      schema: enrichmentSchema,
      prompt,
    }));
  } catch (err) {
    const text =
      err instanceof Error && "text" in err && typeof (err as { text?: unknown }).text === "string"
        ? (err as { text: string }).text
        : "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        object = coerceEnrichment(JSON.parse(text.slice(start, end + 1)));
      } catch {
        object = undefined;
      }
    }
    if (!object) throw err;
  }
  if (!object) {
    throw new Error("OKF model returned no enrichment");
  }

  const type = object.type.trim() || "Document";
  const primary = input.primaries[0];

  return {
    title: object.title.trim(),
    description: object.description.trim().slice(0, 240),
    type,
    tags: normalizeOkfTags(
      object.tags,
      fallbackTags({
        type,
        documentType: input.documentType ?? primary?.documentType,
        primaryPath: primary?.path,
      }),
    ),
    keyFacts: object.keyFacts.map((f) => f.trim()).filter(Boolean).slice(0, 8),
    contents: object.contents?.map((c) => c.trim()).filter(Boolean).slice(0, 12),
  };
}

async function resolveEnrichment(
  input: BuildOkfBundleInput,
): Promise<{
  enrichment: OkfEnrichment;
  mode: "ai" | "fallback";
  generatedBy: string;
  aiError?: string;
}> {
  let mode: "ai" | "fallback" = "fallback";
  let enrichment: OkfEnrichment;
  let generatedBy = input.generatedBy ?? "process:zipwiki-okf-fallback";
  let aiError: string | undefined;

  const provider = resolveOkfProvider(input.provider);
  const modelId = resolveOkfModel(provider, input.model);
  const tag = `${provider}/${modelId}`;
  const requireAi = input.requireAi === true;

  if (input.enrichment) {
    enrichment = ensureEnrichmentTags(input.enrichment, input);
    mode = "ai";
    generatedBy = input.generatedBy ?? `zipwiki/okf@${tag}`;
  } else if (input.useAi !== false) {
    try {
      if (isRemoteOkfMode()) {
        const remote = new RemoteOkfAdapter();
        enrichment = await remote.enrich(input);
        generatedBy = input.generatedBy ?? "zipwiki-api/anthropic/claude-haiku-4-5";
      } else {
        enrichment = await fetchOkfEnrichment({
          ...input,
          provider:
            input.provider ??
            (resolveOkfCredentialSource() === "anthropic"
              ? "anthropic"
              : undefined),
        });
        generatedBy = input.generatedBy ?? `zipwiki/okf@${tag}`;
      }
      mode = "ai";
    } catch (err) {
      if (requireAi) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      aiError = msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
      enrichment = fallbackEnrichment(input);
    }
  } else {
    enrichment = fallbackEnrichment(input);
  }

  return { enrichment, mode, generatedBy, aiError };
}

/**
 * Build package-level OKF files. Uses AI when configured and `useAi` is true;
 * otherwise (or on failure) uses a deterministic fallback.
 */
export async function buildOkfBundle(
  input: BuildOkfBundleInput,
): Promise<OkfBuildResult> {
  if (input.primaries.length === 0) {
    throw new Error("buildOkfBundle requires at least one primary");
  }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const { enrichment, mode, generatedBy, aiError } =
    await resolveEnrichment(input);

  const files = renderOkfFiles({
    enrichment,
    primaries: input.primaries,
    generatedBy,
    generatedAt,
    sources: input.sources,
    logAction: input.logAction,
    conceptFileName: input.conceptFileName,
    includeIndex: input.includeIndex,
  });

  return {
    files,
    mode,
    digest: enrichment.description.slice(0, 240),
    title: enrichment.title,
    conceptType: enrichment.type,
    aiError,
  };
}

/**
 * Build a single-document OKF concept from parse markdown (or filename-only
 * context when parse failed).
 * Emits frontmatter-only `{stem}.md` — body stays in the parse artifact when present.
 */
export async function buildOkfDocument(
  input: BuildOkfDocumentInput,
): Promise<OkfBuildResult> {
  if (!input.sources?.length) {
    throw new Error("buildOkfDocument requires code-owned sources");
  }

  const parsedMarkdown =
    input.parsedMarkdown?.trim() ||
    [
      `# ${input.sourceName}`,
      "",
      "Parse text unavailable. Infer OKF metadata from the filename and file type only;",
      "do not invent specific clause text, page content, or unverified figures.",
      "",
    ].join("\n");

  const digest =
    input.digest?.trim() ||
    input.parsedMarkdown
      ?.split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l.length > 40 &&
          !l.startsWith("#") &&
          !l.startsWith("|") &&
          !l.startsWith("---") &&
          !l.startsWith("```") &&
          !l.startsWith("Parse text unavailable") &&
          !l.startsWith("Parse unavailable"),
      )
      ?.slice(0, 200) ||
    input.sourceName;

  return buildOkfBundle({
    title: input.title ?? input.sourceName,
    digest,
    documentType: input.documentType,
    primaries: [
      {
        path: input.sourceName,
        documentType: input.documentType,
        digest,
        contentSha256: input.contentSha256,
      },
    ],
    parsedMarkdown,
    conceptFileName: conceptFileNameFor(input.sourceName),
    // Multi-file okf CLI writes a combined index.md after all concepts.
    includeIndex: false,
    useAi: input.useAi,
    requireAi: input.requireAi,
    enrichment: input.enrichment,
    provider: input.provider,
    model: input.model,
    generatedBy: input.generatedBy,
    generatedAt: input.generatedAt,
    sources: input.sources,
  });
}

/** Stable fingerprint for tests / optional logging. */
export function okfFilesFingerprint(
  files: { name: string; data: string }[],
): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    h.update(f.name);
    h.update("\0");
    h.update(f.data);
    h.update("\0");
  }
  return h.digest("hex");
}
