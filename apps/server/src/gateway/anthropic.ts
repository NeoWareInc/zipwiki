export const ANTHROPIC_MODEL = "claude-haiku-4-5";

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
    "Primaries:",
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

export async function invokeAnthropic(
  input: OkfRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AnthropicOutput> {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
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
    model: body.model ?? ANTHROPIC_MODEL,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
}
