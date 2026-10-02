/**
 * Hosted package question. The archive stays local: search, passages, and
 * one follow-up read happen here. The model runs on the ZipWiki API.
 */
import { basename } from "node:path";
import { queryArchive, readFollow } from "./evidence.js";
import type { EvidenceGap } from "./search.js";

const BODY_CHARS = 12_000;

export type AskExcerpt = {
  path: string;
  title?: string;
  kind: "okf" | "parsed" | "gap";
  text: string;
  documents?: string[];
};

export type AskArchiveResult = {
  answer: string;
  reads: string[];
  gaps: EvidenceGap[];
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
  creditsUnlimited: boolean;
};

type TurnBody = {
  status?: string;
  answer?: string;
  reads?: Array<{ id?: string; path?: string }>;
  assistant?: unknown[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  creditsCharged?: number;
  creditsRemaining?: number;
  creditsUnlimited?: boolean;
  error?: string;
};

function gapText(gap: EvidenceGap): string {
  return gap.originUri
    ? `${gap.reason} Original: ${gap.originUri}`
    : gap.reason;
}

function excerptsFor(args: {
  package?: string;
  query: string;
}): { excerpts: AskExcerpt[]; gaps: EvidenceGap[]; packagePath: string } | null {
  const found = queryArchive({
    package: args.package,
    query: args.query,
    readTopK: 3,
    maxBytes: BODY_CHARS,
  });
  if (found.hits.length === 0) return null;
  const top = found.hits.slice(0, 3);
  const bodies = new Map(found.topK.map((row) => [row.path, row.text ?? ""]));
  const excerpts: AskExcerpt[] = [];
  const gaps: EvidenceGap[] = [];
  for (const hit of top) {
    const documents = [
      ...(hit.passages ?? []).map((passage) => passage.path),
      ...(hit.gaps ?? []).map((gap) => gap.path),
    ];
    excerpts.push({
      path: hit.path,
      title: hit.title,
      kind: hit.kind,
      text: (bodies.get(hit.path) ?? hit.snippet).slice(0, BODY_CHARS),
      ...(documents.length > 0 ? { documents } : {}),
    });
    for (const passage of hit.passages ?? []) {
      excerpts.push({
        path: passage.path,
        kind: "parsed",
        text: passage.text,
      });
    }
    for (const gap of hit.gaps ?? []) {
      gaps.push(gap);
      excerpts.push({
        path: gap.path,
        kind: "gap",
        text: gapText(gap),
      });
    }
  }
  return { excerpts: excerpts.slice(0, 9), gaps, packagePath: found.package };
}

async function postTurn(
  apiUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  body: unknown,
): Promise<TurnBody> {
  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/api/query/answer`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as TurnBody;
  if (!response.ok) {
    throw new Error(payload.error || `Query API failed (${response.status})`);
  }
  return payload;
}

/**
 * Ask one question of a local package. At most two model calls: the evidence
 * bundle, then one local read if the model asks for it.
 */
export async function askArchive(args: {
  package?: string;
  question: string;
  apiUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  onRead?: (path: string) => void;
}): Promise<AskArchiveResult> {
  const question = args.question.trim();
  if (!question) throw new Error("question is required");
  const fetchImpl = args.fetchImpl ?? fetch;
  const bundled = excerptsFor({
    package: args.package,
    query: question,
  });
  if (!bundled) {
    return {
      answer: "No concept matched this question.",
      reads: [],
      gaps: [],
      model: "",
      creditsCharged: 0,
      creditsRemaining: 0,
      creditsUnlimited: false,
    };
  }
  const filename = basename(args.package ?? "wiki.zipwiki");
  let creditsCharged = 0;
  let creditsRemaining = 0;
  let creditsUnlimited = false;
  let reads: string[] = [];
  const first = await postTurn(args.apiUrl, args.apiKey, fetchImpl, {
    question,
    filename,
    excerpts: bundled.excerpts,
  });
  creditsCharged += first.creditsCharged ?? 0;
  creditsRemaining = first.creditsRemaining ?? creditsRemaining;
  creditsUnlimited = first.creditsUnlimited === true;
  const requested = (first.reads ?? []).find(
    (read) => typeof read.id === "string" && typeof read.path === "string",
  );
  if (first.status !== "read" || !requested?.id || !requested.path) {
    const answer = first.answer?.trim() ?? "";
    if (!answer) throw new Error("Claude returned an empty answer");
    return {
      answer,
      reads,
      gaps: bundled.gaps,
      model: first.model ?? "",
      creditsCharged,
      creditsRemaining,
      creditsUnlimited,
    };
  }
  args.onRead?.(requested.path);
  reads = [requested.path];
  const loaded = readFollow(bundled.packagePath, requested.path);
  const follow = await postTurn(args.apiUrl, args.apiKey, fetchImpl, {
    question,
    filename,
    excerpts: bundled.excerpts,
    finish: true,
    transcript: [
      { role: "assistant", content: first.assistant ?? [] },
      {
        role: "user",
        results: [
          {
            id: requested.id,
            path: requested.path,
            ...("error" in loaded
              ? { error: loaded.error }
              : { text: loaded.text }),
          },
        ],
      },
    ],
  });
  creditsCharged += follow.creditsCharged ?? 0;
  creditsRemaining = follow.creditsRemaining ?? creditsRemaining;
  creditsUnlimited = follow.creditsUnlimited === true || creditsUnlimited;
  const answer = follow.answer?.trim() ?? "";
  if (!answer) throw new Error("Claude returned an empty answer");
  return {
    answer,
    reads,
    gaps: bundled.gaps,
    model: follow.model ?? first.model ?? "",
    creditsCharged,
    creditsRemaining,
    creditsUnlimited,
  };
}
