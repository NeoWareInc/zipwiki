/** Keep in sync with convex/lib/credits.ts HOSTED_OKF_MODELS. */
export const DEFAULT_HOSTED_OKF_MODEL = "claude-haiku-4-5";

export const HOSTED_OKF_MODELS = [
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
] as const;

export type HostedOkfModel = (typeof HOSTED_OKF_MODELS)[number];

/** @deprecated Use DEFAULT_HOSTED_OKF_MODEL */
export const ANTHROPIC_MODEL = DEFAULT_HOSTED_OKF_MODEL;

export function resolveHostedOkfModel(model?: string | null): HostedOkfModel {
  const trimmed = model?.trim();
  if (
    trimmed &&
    (HOSTED_OKF_MODELS as readonly string[]).includes(trimmed)
  ) {
    return trimmed as HostedOkfModel;
  }
  return DEFAULT_HOSTED_OKF_MODEL;
}

export type OkfRequest = {
  primaries?: Array<{ path?: string; documentType?: string }>;
  parsedMarkdown?: string;
  title?: string;
  digest?: string;
  documentType?: string;
};

export type OkfEnrichment = {
  title: string;
  description: string;
  type: string;
  tags: string[];
  keyFacts: string[];
  contents?: string[];
};

export type AnthropicOutput = {
  enrichment: OkfEnrichment;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

/** Keep in step with `OKF_PARSE_SAMPLE_CHARS` in the zipwiki client. */
export const MAX_PARSE_CHARS = 12_000;

function promptFor(input: OkfRequest): string {
  const sample = (input.parsedMarkdown ?? "").slice(0, MAX_PARSE_CHARS);
  const primaries = (input.primaries ?? [])
    .map((item) => `- ${item.path ?? "document"}${item.documentType ? ` [${item.documentType}]` : ""}`)
    .join("\n");
  return [
    "You author Open Knowledge Format metadata for one ZipWiki document.",
    "Return only JSON with keys title, description, type, tags, keyFacts, and optional contents.",
    "title: concise. description: 1-2 sentences, max 240 chars.",
    "type: a short document type such as Document, Contract, Invoice, or Technical Document.",
    "tags: 2-8 short lowercase labels. keyFacts: 3-8 concrete bullets. contents: optional section names.",
    "Do not invent amounts or dates that are not in the text.",
    "",
    `Suggested type: ${input.documentType ?? "Document"}`,
    `Title hint: ${input.title ?? "(none)"}`,
    `Digest hint: ${input.digest ?? "(none)"}`,
    "Documents:",
    primaries || "(none)",
    "",
    "Parsed text sample:",
    sample || "(no parse text)",
  ].join("\n");
}

function asEnrichment(value: unknown): OkfEnrichment {
  if (!value || typeof value !== "object") {
    throw new Error("Claude did not return an object");
  }
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const description =
    typeof row.description === "string" ? row.description.trim().slice(0, 240) : "";
  const type = typeof row.type === "string" ? row.type.trim() : "Document";
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : [];
  const keyFacts = Array.isArray(row.keyFacts)
    ? row.keyFacts
        .filter((fact): fact is string => typeof fact === "string")
        .slice(0, 8)
    : [];
  const contents = Array.isArray(row.contents)
    ? row.contents
        .filter((item): item is string => typeof item === "string")
        .slice(0, 12)
    : undefined;
  if (!title || !description) throw new Error("Claude omitted title or description");
  return { title, description, type: type || "Document", tags, keyFacts, contents };
}

export type QueryAnswer = {
  answer: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

function queryPrompt(
  question: string,
  excerpts: Array<{ path: string; title?: string; kind: string; text: string }>,
): string {
  const blocks = excerpts
    .map((excerpt, index) => {
      const title = excerpt.title ? ` — ${excerpt.title}` : "";
      return [
        `Excerpt ${index + 1} (${excerpt.kind}): ${excerpt.path}${title}`,
        excerpt.text,
      ].join("\n");
    })
    .join("\n\n");
  return [
    "Answer the question using only the ZipWiki concept excerpts below.",
    "If the excerpts do not contain the answer, say that they do not.",
    "Do not use outside knowledge and do not invent amounts, dates, or names.",
    "Mention the excerpt path when you rely on it.",
    "",
    `Question: ${question}`,
    "",
    blocks,
  ].join("\n");
}

/** Plain-text answer over concept excerpts. The Anthropic key stays on this API. */
export async function invokeQueryAnswer(
  question: string,
  excerpts: Array<{ path: string; title?: string; kind: string; text: string }>,
  apiKey: string,
  fetchImpl: typeof fetch,
  model?: string | null,
): Promise<QueryAnswer> {
  const resolved = resolveHostedOkfModel(model);
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: resolved,
      max_tokens: 1024,
      messages: [{ role: "user", content: queryPrompt(question, excerpts) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic failed (${res.status})`);
  const body = (await res.json()) as {
    model?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const answer = (body.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!answer) throw new Error("Claude returned an empty answer");
  return {
    answer,
    model: body.model ?? resolved,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
}

export async function invokeAnthropic(
  input: OkfRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
  model?: string | null,
): Promise<AnthropicOutput> {
  const resolved = resolveHostedOkfModel(model);
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: resolved,
      max_tokens: 1024,
      messages: [{ role: "user", content: promptFor(input) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic failed (${res.status})`);
  const body = (await res.json()) as {
    model?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (body.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Claude did not return JSON");
  const enrichment = asEnrichment(JSON.parse(text.slice(start, end + 1)));
  return {
    enrichment,
    model: body.model ?? resolved,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
}
