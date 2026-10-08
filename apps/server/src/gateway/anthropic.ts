/** Keep in sync with convex/lib/credits.ts HOSTED_OKF_MODELS. */
export const DEFAULT_HOSTED_OKF_MODEL = "claude-haiku-5-5";

export const HOSTED_OKF_MODELS = [
  "claude-haiku-5-5",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
] as const;

export type HostedOkfModel = (typeof HOSTED_OKF_MODELS)[number];

/** @deprecated Use DEFAULT_HOSTED_OKF_MODEL */
export const ANTHROPIC_MODEL = DEFAULT_HOSTED_OKF_MODEL;

/** Haiku 5.5 thinks by default. Low effort keeps a short OKF reply inside max_tokens. */
function haiku55Body(model: string): { output_config?: { effort: "low" } } {
  if (model !== "claude-haiku-5-5") return {};
  return { output_config: { effort: "low" } };
}

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
  /** book | legislation | invoice | generic. Omitted keeps the generic prompt. */
  okfProfile?: string;
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

/** Room for a book sample: 6,000 opening + marker + 6,000 ending. */
const BOOK_SAMPLE_CHARS = 13_000;

/**
 * Keep these sentences in step with `okfProfileInstruction` in
 * `apps/zipwiki/src/lib/okf/profiles.ts`. The API image does not import that package.
 */
function hostedProfileInstruction(profile: string): string | undefined {
  switch (profile) {
    case "book":
      return "This file is a book. type is Book. keyFacts are the author, the title, the date or setting, and one distinctive line or scene from the sample. Do not invent amounts, dates, names, or citations that are not in the sample.";
    case "legislation":
      return "This file is legislation. type is Legislation. keyFacts are the jurisdiction, the citation or chapter, and what the section regulates. Do not invent amounts, dates, names, or citations that are not in the sample.";
    case "invoice":
      return "This file is an invoice. type is Invoice. keyFacts are the vendor, the invoice number, the date, and the total, and only when those strings are in the sample. Do not invent amounts, dates, names, or citations that are not in the sample.";
    default:
      return undefined;
  }
}

export function promptFor(input: OkfRequest): string {
  const profile = input.okfProfile?.trim().toLowerCase() ?? "";
  const instruction = hostedProfileInstruction(profile);
  const sample = (input.parsedMarkdown ?? "").slice(
    0,
    instruction && profile === "book" ? BOOK_SAMPLE_CHARS : MAX_PARSE_CHARS,
  );
  const primaries = (input.primaries ?? [])
    .map((item) => `- ${item.path ?? "document"}${item.documentType ? ` [${item.documentType}]` : ""}`)
    .join("\n");
  const typeLine = instruction
    ? instruction
    : "type: a short document type such as Document, Contract, Invoice, or Technical Document.";
  const factsLine = instruction
    ? "tags: 2-8 short lowercase labels. contents: optional section names."
    : "tags: 2-8 short lowercase labels. keyFacts: 3-8 concrete bullets. contents: optional section names.";
  return [
    "You author Open Knowledge Format metadata for one ZipWiki document.",
    "Return only JSON with keys title, description, type, tags, keyFacts, and optional contents.",
    "title: concise. description: 1-2 sentences, max 240 chars.",
    typeLine,
    factsLine,
    instruction
      ? "Do not invent amounts, dates, names, or citations that are not in the sample."
      : "Do not invent amounts or dates that are not in the text.",
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
  offset: number;
};

export type QuerySearch = {
  id: string;
  phrase: string;
};

export type QueryOrigin = {
  id: string;
  path: string;
};

export type QueryTurn =
  | {
      status: "answer";
      answer: string;
      reads: [];
      search: null;
      origin: null;
      assistant: [];
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      status: "read";
      answer: "";
      reads: QueryRead[];
      search: null;
      origin: null;
      assistant: unknown[];
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      status: "search";
      answer: "";
      reads: [];
      search: QuerySearch;
      origin: null;
      assistant: unknown[];
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      status: "origin";
      answer: "";
      reads: [];
      search: null;
      origin: QueryOrigin;
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
    "Read one text entry from the open .zipwiki. Use a wiki/parsed or wiki/okf markdown path, or a stored .txt or .md primary named in the excerpts. Do not use this for PDF, Office, or image files: if the excerpts say no extract was stored, that text is not in the package.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Archive path, for example wiki/parsed/deed.pdf.md",
      },
      offset: {
        type: "integer",
        description:
          "Character index to start at. Use the offset from a search hit, or the next value from the previous read. Omit to start at 0.",
      },
    },
    required: ["path"],
  },
};

const SEARCH_ZIPWIKI_TOOL = {
  name: "search_zipwiki",
  description:
    "Find an exact phrase in the open .zipwiki. Scans concept cards, parsed markdown, and stored .txt or .md files. Does not open PDF, Office, or image bytes.",
  input_schema: {
    type: "object",
    properties: {
      phrase: {
        type: "string",
        description: "Exact phrase to find. At least 2 characters.",
      },
    },
    required: ["phrase"],
  },
};

const ORIGIN_ZIPWIKI_TOOL = {
  name: "origin_zipwiki",
  description:
    "Return the original file's link from Extra Field 0x014F. Does not download the file. Pass a wiki/parsed path or the primary name, for example wiki/parsed/deed.pdf.md.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Parsed path or primary name.",
      },
    },
    required: ["path"],
  },
};

const QUERY_TOOLS = [SEARCH_ZIPWIKI_TOOL, READ_ZIPWIKI_TOOL, ORIGIN_ZIPWIKI_TOOL];

function searchPhraseFrom(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const phrase = (input as { phrase?: unknown }).phrase;
  if (typeof phrase !== "string") return null;
  const clean = phrase.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 200) return null;
  return clean;
}

function readOffsetFrom(input: unknown): number | null {
  if (!input || typeof input !== "object" || !("offset" in input)) return 0;
  const raw = (input as { offset?: unknown }).offset;
  if (raw === undefined || raw === null) return 0;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > 50_000_000) return null;
  return Math.floor(value);
}

function toolPathFrom(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const path = (input as { path?: unknown }).path;
  if (typeof path !== "string" || !isQueryFollowPath(path)) return null;
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

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
    ? [
        "No further searches, reads, or origin lookups are available.",
        "Answer now from the excerpts and any search/read results already in this conversation.",
        "If a prior origin_zipwiki result returned a URL, include it. Do not invent a URL and do not say you will search or read.",
        "If the package does not contain the answer, say so clearly in one or two sentences.",
      ].join(" ")
    : [
        "The excerpts are concept cards, passages from cited text, and gaps.",
        "A gap means no extract was stored when the package was created. Say that the package does not contain that document's text. Do not invent it and do not ask to read a PDF, Office, or image file.",
        "When you need more text, call one tool immediately with no preamble. Do not say that you will search or read; call the tool instead.",
        "search_zipwiki finds a phrase (or nearby words) and reports the character offset of each hit. Prefer a short distinctive phrase such as a section heading (for example Termination).",
        "read_zipwiki reads 12000 characters of one wiki/parsed path, one wiki/okf path, or a stored .txt or .md primary, starting at offset. The result begins with offset, next, and total. If the line you need is not in the window and next is less than total, call read_zipwiki again with offset set to next. When a search hit includes an offset, pass that offset so the read starts at the phrase.",
        "origin_zipwiki returns only the original file's link. It does not download the file.",
        "When you use a passage, name its full parsed path in bold. Before your final answer, call origin_zipwiki with that parsed path and include the returned URL. Do not invent the URL.",
      ].join(" ");
  return [
    "Answer the question using the open ZipWiki package.",
    follow,
    "Do not use outside knowledge and do not invent amounts, dates, or names.",
    "If the package does not contain the answer, say that it does not.",
    "",
    `Question: ${question}`,
    "",
    blocks,
  ].join("\n");
}

function toolResultContent(result: QueryToolResult): string {
  if (result.error?.trim()) return result.error.trim().slice(0, 500);
  return (result.text ?? "").slice(0, MAX_PARSE_CHARS + 256);
}

/** Narration that usually means the model meant to call a tool but didn't. */
export function looksLikeToolPreamble(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (
    /^(let me|i('ll| will)|i am going to|i'm going to|searching|looking|reading|checking|trying|one moment)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(let me|i('ll| will)|try (a |another |a different )?search|search (more|again|within|for)|looking for|reading (the|more))\b/i.test(
      t,
    ) &&
    t.length < 500
  ) {
    return true;
  }
  if (t.length < 280 && /[:…]\s*$/.test(t)) return true;
  return false;
}

const FINISH_NUDGE =
  "Stop searching. Tools are no longer available. Give a complete answer now from the package text already provided, or say clearly that the package does not contain the information.";

type AnthropicContentBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
};

type AnthropicMessageBody = {
  model?: string;
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function postQueryMessages(
  args: {
    model: string;
    messages: Array<{ role: "user" | "assistant"; content: unknown }>;
    finish: boolean;
    toolChoice?: "auto" | "any";
  },
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AnthropicMessageBody> {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 1024,
      ...haiku55Body(args.model),
      ...(args.finish
        ? {}
        : {
            tools: QUERY_TOOLS,
            tool_choice: { type: args.toolChoice ?? "auto" },
          }),
      messages: args.messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic failed (${res.status})`);
  return (await res.json()) as AnthropicMessageBody;
}

function parseQueryTool(
  content: AnthropicContentBlock[],
  finish: boolean,
): {
  tool:
    | { name: "read_zipwiki"; id: string; path: string; offset: number }
    | { name: "search_zipwiki"; id: string; phrase: string }
    | { name: "origin_zipwiki"; id: string; path: string }
    | null;
  assistant: unknown[];
  answerText: string;
} {
  const assistant: unknown[] = [];
  let tool:
    | { name: "read_zipwiki"; id: string; path: string; offset: number }
    | { name: "search_zipwiki"; id: string; phrase: string }
    | { name: "origin_zipwiki"; id: string; path: string }
    | null = null;
  for (const block of content) {
    if (block.type === "text" && block.text) {
      assistant.push({ type: "text", text: block.text });
      continue;
    }
    if (finish || tool || block.type !== "tool_use") continue;
    const id = typeof block.id === "string" ? block.id.trim() : "";
    if (!id) continue;
    if (block.name === "search_zipwiki") {
      const phrase = searchPhraseFrom(block.input);
      if (!phrase) continue;
      tool = { name: "search_zipwiki", id, phrase };
      assistant.push({
        type: "tool_use",
        id,
        name: "search_zipwiki",
        input: { phrase },
      });
      continue;
    }
    if (block.name === "origin_zipwiki") {
      const path = toolPathFrom(block.input);
      if (!path) continue;
      tool = { name: "origin_zipwiki", id, path };
      assistant.push({
        type: "tool_use",
        id,
        name: "origin_zipwiki",
        input: { path },
      });
      continue;
    }
    if (block.name !== "read_zipwiki") continue;
    const path = toolPathFrom(block.input);
    const offset = readOffsetFrom(block.input);
    if (!path || offset === null) continue;
    tool = { name: "read_zipwiki", id, path, offset };
    assistant.push({
      type: "tool_use",
      id,
      name: "read_zipwiki",
      input: { path, offset },
    });
  }
  const answerText = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { tool, assistant, answerText };
}

/**
 * One model turn. A `read`, `search`, or `origin` result asks the caller to
 * run that command on the open archive and send the text back. The Anthropic
 * key stays on this API.
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

  let body = await postQueryMessages(
    { model: resolved, messages, finish, toolChoice: "auto" },
    apiKey,
    fetchImpl,
  );
  let content = body.content ?? [];
  let parsed = parseQueryTool(content, finish);

  // Models often narrate "Let me search…" without a tool call. Force one tool.
  if (!finish && !parsed.tool && looksLikeToolPreamble(parsed.answerText)) {
    body = await postQueryMessages(
      { model: resolved, messages, finish, toolChoice: "any" },
      apiKey,
      fetchImpl,
    );
    content = body.content ?? [];
    parsed = parseQueryTool(content, finish);
  }

  // Last turn: refuse incomplete "I'll search…" answers and force a real reply.
  if (finish && looksLikeToolPreamble(parsed.answerText)) {
    body = await postQueryMessages(
      {
        model: resolved,
        messages: [...messages, { role: "user", content: FINISH_NUDGE }],
        finish: true,
      },
      apiKey,
      fetchImpl,
    );
    content = body.content ?? [];
    parsed = parseQueryTool(content, true);
  }

  const usage = {
    model: body.model ?? resolved,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
  const { tool, assistant, answerText: answer } = parsed;

  if (tool?.name === "search_zipwiki") {
    return {
      status: "search",
      answer: "",
      reads: [],
      search: { id: tool.id, phrase: tool.phrase },
      origin: null,
      assistant,
      ...usage,
    };
  }
  if (tool?.name === "origin_zipwiki") {
    return {
      status: "origin",
      answer: "",
      reads: [],
      search: null,
      origin: { id: tool.id, path: tool.path },
      assistant,
      ...usage,
    };
  }
  if (tool?.name === "read_zipwiki") {
    return {
      status: "read",
      answer: "",
      reads: [{ id: tool.id, path: tool.path, offset: tool.offset }],
      search: null,
      origin: null,
      assistant,
      ...usage,
    };
  }

  // Never surface a tool preamble as the billed answer.
  if (!finish && !tool && looksLikeToolPreamble(answer)) {
    throw new Error("Claude narrated a search without calling a tool");
  }
  if (!answer || looksLikeToolPreamble(answer)) {
    throw new Error("Claude returned an incomplete answer");
  }
  return {
    status: "answer",
    answer,
    reads: [],
    search: null,
    origin: null,
    assistant: [],
    ...usage,
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
      ...haiku55Body(resolved),
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
