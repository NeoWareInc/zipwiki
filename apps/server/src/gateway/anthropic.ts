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

export type QueryExcerpt = {
  path: string;
  title?: string;
  kind: string;
  text: string;
  documents?: string[];
};

export type QueryToolResult = {
  id: string;
  path: string;
  text?: string;
  error?: string;
};

export type QueryTranscriptTurn =
  | { role: "assistant"; content: unknown[] }
  | { role: "user"; results: QueryToolResult[] };

export type QueryRead = {
  id: string;
  path: string;
};

export type QueryTurn =
  | {
      status: "answer";
      answer: string;
      reads: [];
      assistant: [];
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      status: "read";
      answer: "";
      reads: QueryRead[];
      assistant: unknown[];
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    };

/**
 * Paths the model may ask the caller to load.
 * Keep in step with `queryReadKind` in the zipwiki access library.
 * Binary primaries are forwarded so the caller can refuse them; traversal is not.
 */
export function isQueryFollowPath(path: string): boolean {
  const name = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !name ||
    name.length > 512 ||
    name.includes("..") ||
    name.includes("\0") ||
    name.includes("://") ||
    name.endsWith("/")
  ) {
    return false;
  }
  if (name.startsWith("wiki/okf/") && name.endsWith(".md")) return true;
  if (name.startsWith("wiki/parsed/") && name.endsWith(".md")) return true;
  if (name.startsWith("wiki/") || name.startsWith("META-INF/")) return false;
  return true;
}

const READ_ZIPWIKI_TOOL = {
  name: "read_zipwiki",
  description:
    "Read one more text entry from the open .zipwiki. Use a wiki/parsed or wiki/okf markdown path, or a stored .txt or .md primary named in the excerpts. Do not use this for PDF, Office, or image files: if the excerpts say no extract was stored, that text is not in the package.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Archive path, for example wiki/parsed/deed.pdf.md",
      },
    },
    required: ["path"],
  },
};

function queryPrompt(question: string, excerpts: QueryExcerpt[], finish: boolean): string {
  const blocks = excerpts
    .map((excerpt, index) => {
      const title = excerpt.title ? ` — ${excerpt.title}` : "";
      if (excerpt.kind === "gap") {
        return [
          `Excerpt ${index + 1} (no extract): ${excerpt.path}${title}`,
          excerpt.text,
        ].join("\n");
      }
      const documents =
        excerpt.kind === "parsed"
          ? [excerpt.path]
          : (excerpt.documents ?? []).filter((path) => path.trim());
      const documentLine =
        documents.length > 0
          ? `Full document: ${documents.join(", ")}`
          : "Full document: (none listed)";
      return [
        `Excerpt ${index + 1} (${excerpt.kind}): ${excerpt.path}${title}`,
        documentLine,
        excerpt.text,
      ].join("\n");
    })
    .join("\n\n");
  const follow = finish
    ? "No further reads are available. Answer from the excerpts and any documents already read."
    : [
        "The excerpts are concept cards, passages from cited text, and gaps.",
        "A gap means no extract was stored when the package was created. Say that the package does not contain that document's text. Do not invent it and do not ask to read a PDF, Office, or image file.",
        "When a passage is not enough, call read_zipwiki once with a wiki/parsed path, a wiki/okf path, or a stored .txt or .md primary named above.",
      ].join(" ");
  return [
    "Answer the question using the open ZipWiki package.",
    follow,
    "Do not use outside knowledge and do not invent amounts, dates, or names.",
    "If the package does not contain the answer, say that it does not.",
    "When you use a passage, name its full document path (the parsed text file), not only the concept card.",
    "",
    `Question: ${question}`,
    "",
    blocks,
  ].join("\n");
}

function toolResultContent(result: QueryToolResult): string {
  if (result.error?.trim()) return result.error.trim().slice(0, 500);
  return (result.text ?? "").slice(0, MAX_PARSE_CHARS);
}

/**
 * One model turn. A `read` result asks the caller to load those archive
 * paths locally and send them back. The Anthropic key stays on this API.
 */
export async function invokeQueryTurn(
  input: {
    question: string;
    excerpts: QueryExcerpt[];
    transcript?: QueryTranscriptTurn[];
    finish?: boolean;
  },
  apiKey: string,
  fetchImpl: typeof fetch,
  model?: string | null,
): Promise<QueryTurn> {
  const resolved = resolveHostedOkfModel(model);
  const finish = input.finish === true;
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: queryPrompt(input.question, input.excerpts, finish) },
  ];
  for (const turn of input.transcript ?? []) {
    if (turn.role === "assistant") {
      messages.push({ role: "assistant", content: turn.content });
      continue;
    }
    messages.push({
      role: "user",
      content: turn.results.map((result) => ({
        type: "tool_result",
        tool_use_id: result.id,
        content: toolResultContent(result),
        is_error: Boolean(result.error?.trim()),
      })),
    });
  }
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
      ...(finish ? {} : { tools: [READ_ZIPWIKI_TOOL] }),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic failed (${res.status})`);
  const body = (await res.json()) as {
    model?: string;
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const content = body.content ?? [];
  const reads: QueryRead[] = [];
  const assistant: unknown[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      assistant.push({ type: "text", text: block.text });
      continue;
    }
    if (finish || block.type !== "tool_use" || block.name !== "read_zipwiki") continue;
    const path =
      block.input && typeof block.input === "object"
        ? (block.input as { path?: unknown }).path
        : undefined;
    const id = typeof block.id === "string" ? block.id.trim() : "";
    if (!id || typeof path !== "string" || !isQueryFollowPath(path)) continue;
    const clean = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (reads.length >= 1) continue;
    reads.push({ id, path: clean });
    assistant.push({
      type: "tool_use",
      id,
      name: "read_zipwiki",
      input: { path: clean },
    });
  }
  const usage = {
    model: body.model ?? resolved,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
  if (reads.length > 0) {
    return { status: "read", answer: "", reads, assistant, ...usage };
  }
  const answer = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!answer) throw new Error("Claude returned an empty answer");
  return { status: "answer", answer, reads: [], assistant: [], ...usage };
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
