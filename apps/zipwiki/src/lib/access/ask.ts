/**
 * Hosted package question. The archive stays local. The model may search
 * for a phrase or read stored text, up to four times, on this package.
 */
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { maybeReportActivity } from "../config/activity-telemetry.js";
import {
  formatFollowWindow,
  formatPhraseHits,
  queryArchive,
  readFollow,
  searchPhrase,
} from "./evidence.js";
import { lookupOrigin } from "./origin.js";
import type { EvidenceGap, EvidencePassage } from "./search.js";

function collapsePriorReads(
  transcript: Array<
    | { role: "assistant"; content: unknown[] }
    | {
        role: "user";
        results: Array<{ id: string; path: string; text?: string; error?: string }>;
      }
  >,
): void {
  for (const turn of transcript) {
    if (turn.role !== "user") continue;
    for (const result of turn.results) {
      if (!result.text) continue;
      const lines = result.text.split("\n");
      if (
        lines[0]?.startsWith("offset ") &&
        lines[1]?.startsWith("next ") &&
        lines[2]?.startsWith("total ")
      ) {
        result.text = lines.slice(0, 3).join("\n");
      }
    }
  }
}

const BODY_CHARS = 12_000;
const ASK_EXCERPT_CAP = 9;

export type AskExcerpt = {
  path: string;
  title?: string;
  kind: "okf" | "parsed" | "gap";
  text: string;
  documents?: string[];
};

export type AskSource = {
  path: string;
  kind: "parsed" | "okf" | "original";
};

export type AskArchiveResult = {
  answer: string;
  reads: string[];
  searches: string[];
  sources: AskSource[];
  passages: EvidencePassage[];
  gaps: EvidenceGap[];
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
  creditsUnlimited: boolean;
};

export function sourceKind(path: string): AskSource["kind"] {
  if (path.startsWith("wiki/okf/")) return "okf";
  if (path.startsWith("wiki/parsed/")) return "parsed";
  return "original";
}

export function rememberSource(current: AskSource[], path: string): AskSource[] {
  if (!path || path === "search" || current.some((item) => item.path === path)) {
    return current;
  }
  return [...current, { path, kind: sourceKind(path) }];
}

/** Website rejects a reply that only announces a search. */
export function isIncompleteAskAnswer(answerText: string): boolean {
  return (
    /^(let me|i('ll| will)|trying)\b/i.test(answerText) ||
    (answerText.length < 280 && /[:…]\s*$/.test(answerText))
  );
}

export function askFailureMessage(error: string): string {
  if (/credits_locked/.test(error)) {
    return "ZipWiki credits are locked for this account.";
  }
  if (/account_disabled/.test(error)) return "This account is disabled.";
  if (/credits_exhausted/.test(error)) {
    return "Credits are required to ask a question.";
  }
  if (/anthropic_not_configured/.test(error)) {
    return "Hosted answers are not configured on this deployment.";
  }
  if (/incomplete answer|without calling a tool/i.test(error)) {
    return "The answer stopped mid-search. Try asking again with a shorter phrase from the document (for example “termination”).";
  }
  return error;
}

/**
 * Question from the command line, or one line from the terminal.
 * A pipe with no question exits instead of waiting.
 */
export async function resolveAskQuestion(input: {
  question?: string;
  isTTY: boolean;
  readLine: () => Promise<string>;
}): Promise<string> {
  const given = input.question?.trim() ?? "";
  if (given) return given;
  if (!input.isTTY) {
    throw new Error(
      "A question is required. Pass it after the package, or run ask in a terminal.",
    );
  }
  const line = (await input.readLine()).trim();
  if (!line) throw new Error("A question is required.");
  return line;
}

/** Stderr block after the answer: credits, sources, passages, and gaps. */
export function formatAskReport(result: AskArchiveResult): string {
  const lines: string[] = [];
  if (result.model) {
    lines.push(
      result.creditsUnlimited
        ? "Unlimited · no charge"
        : `Charged ${result.creditsCharged} credit${result.creditsCharged === 1 ? "" : "s"} · ${result.creditsRemaining.toLocaleString()} remaining`,
    );
  }
  if (result.reads.length > 0) {
    lines.push(`Also read ${result.reads.join(", ")}`);
  }
  for (const source of result.sources) {
    lines.push(`${source.path}  ${source.kind}`);
  }
  for (const passage of result.passages) {
    lines.push(`Passage: ${passage.path}`);
  }
  for (const gap of result.gaps) {
    const origin = gap.originUri ? ` Original: ${gap.originUri}` : "";
    lines.push(`Gap: ${gap.path} — ${gap.reason}${origin}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

type TurnBody = {
  status?: string;
  answer?: string;
  reads?: Array<{ id?: string; path?: string; offset?: number }>;
  search?: { id?: string; phrase?: string } | null;
  origin?: { id?: string; path?: string } | null;
  assistant?: unknown[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  creditsCharged?: number;
  creditsRemaining?: number;
  creditsUnlimited?: boolean;
  error?: string;
};

type AskTranscript = Array<
  | { role: "assistant"; content: unknown[] }
  | {
      role: "user";
      results: Array<{ id: string; path: string; text?: string; error?: string }>;
    }
>;

function gapText(gap: EvidenceGap): string {
  return gap.originUri
    ? `${gap.reason} Original: ${gap.originUri}`
    : gap.reason;
}

/**
 * Parsed windows first, then OKF or parsed hit bodies, then gaps.
 * Stops at nine items, matching the website Ask bundle.
 */
export function bundleAskExcerpts(input: {
  passages: Array<{ path: string; text: string }>;
  hits: Array<{
    path: string;
    title?: string;
    kind: "okf" | "parsed";
    text: string;
    documents?: string[];
  }>;
  gaps: EvidenceGap[];
}): AskExcerpt[] {
  const excerpts: AskExcerpt[] = [];
  for (const passage of input.passages) {
    if (excerpts.length >= ASK_EXCERPT_CAP) break;
    excerpts.push({ path: passage.path, kind: "parsed", text: passage.text });
  }
  for (const hit of input.hits) {
    if (excerpts.length >= ASK_EXCERPT_CAP) break;
    excerpts.push({
      path: hit.path,
      title: hit.title,
      kind: hit.kind,
      text: hit.text.slice(0, BODY_CHARS),
      ...(hit.documents && hit.documents.length > 0
        ? { documents: hit.documents }
        : {}),
    });
  }
  for (const gap of input.gaps) {
    if (excerpts.length >= ASK_EXCERPT_CAP) break;
    excerpts.push({ path: gap.path, kind: "gap", text: gapText(gap) });
  }
  return excerpts;
}

function excerptsFor(args: {
  package?: string;
  query: string;
}): {
  excerpts: AskExcerpt[];
  gaps: EvidenceGap[];
  passages: EvidencePassage[];
  packagePath: string;
} | null {
  const found = queryArchive({
    package: args.package,
    query: args.query,
    readTopK: 3,
    maxBytes: BODY_CHARS,
  });
  const top = found.hits.slice(0, 3);
  const bodies = new Map(found.topK.map((row) => [row.path, row.text ?? ""]));
  const passages = top.flatMap((hit) => hit.passages ?? []);
  const gaps = top.flatMap((hit) => hit.gaps ?? []);
  const hits = top.map((hit) => {
    const documents = [
      ...(hit.passages ?? []).map((passage) => passage.path),
      ...(hit.gaps ?? []).map((gap) => gap.path),
    ];
    return {
      path: hit.path,
      title: hit.title,
      kind: hit.kind,
      text: (bodies.get(hit.path) ?? hit.snippet).slice(0, BODY_CHARS),
      ...(documents.length > 0 ? { documents } : {}),
    };
  });
  if (passages.length === 0 && hits.length === 0) return null;
  return {
    excerpts: bundleAskExcerpts({ passages, hits, gaps }),
    gaps,
    passages,
    packagePath: found.package,
  };
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
    throw new Error(
      askFailureMessage(payload.error || `Query API failed (${response.status})`),
    );
  }
  return payload;
}

/**
 * Ask one question of a local package. The first call sends the evidence
 * bundle. The model may then search or read up to four times. The fifth
 * call, if needed, must answer.
 */
export async function askArchive(args: {
  package?: string;
  question: string;
  apiUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  onRead?: (path: string, offset: number) => void;
  onSearch?: (phrase: string) => void;
  onOrigin?: (path: string) => void;
}): Promise<AskArchiveResult> {
  const question = args.question.trim();
  if (!question) throw new Error("question is required");
  const fetchImpl = args.fetchImpl ?? fetch;
  const bundled = excerptsFor({
    package: args.package,
    query: question,
  });
  if (!bundled) {
    const askId = randomUUID();
    void maybeReportActivity({
      type: "query",
      action: "query_no_excerpts",
      status: "fail",
      path: args.package,
      createId: askId,
      quiet: true,
    });
    return {
      answer: "No matching text was found in this package for that question.",
      reads: [],
      searches: [],
      sources: [],
      passages: [],
      gaps: [],
      model: "",
      creditsCharged: 0,
      creditsRemaining: 0,
      creditsUnlimited: false,
    };
  }
  const filename = basename(args.package ?? "wiki.zipwiki");
  const askId = randomUUID();
  let creditsCharged = 0;
  let creditsRemaining = 0;
  let creditsUnlimited = false;
  let model = "";
  const reads: string[] = [];
  const searches: string[] = [];
  let sources: AskSource[] = [];
  for (const passage of bundled.passages) {
    sources = rememberSource(sources, passage.path);
  }
  const transcript: Array<
    | { role: "assistant"; content: unknown[] }
    | {
        role: "user";
        results: Array<{ id: string; path: string; text?: string; error?: string }>;
      }
  > = [];
  let answered = false;
  try {
    for (let round = 0; round < 5; round += 1) {
      const turn = await postTurn(args.apiUrl, args.apiKey, fetchImpl, {
        question,
        filename,
        askId,
        excerpts: bundled.excerpts,
        ...(transcript.length > 0 ? { transcript } : {}),
        ...(round === 4 ? { finish: true } : {}),
      });
      creditsCharged += turn.creditsCharged ?? 0;
      creditsRemaining = turn.creditsRemaining ?? creditsRemaining;
      creditsUnlimited = turn.creditsUnlimited === true || creditsUnlimited;
      model = turn.model ?? model;
      const finish = round === 4;
      const requested = (turn.reads ?? []).find(
        (read) => typeof read.id === "string" && typeof read.path === "string",
      );
      const searchId = turn.search?.id;
      const searchPhraseText = turn.search?.phrase;
      if (
        !finish &&
        turn.status === "search" &&
        typeof searchId === "string" &&
        typeof searchPhraseText === "string"
      ) {
        args.onSearch?.(searchPhraseText);
        searches.push(searchPhraseText);
        const hits = searchPhrase(bundled.packagePath, searchPhraseText);
        for (const hit of hits) sources = rememberSource(sources, hit.path);
        if (hits.length === 0) {
          void maybeReportActivity({
            type: "query",
            action: "query_no_phrase_hits",
            status: "fail",
            path: args.package,
            createId: askId,
            quiet: true,
          });
        }
        collapsePriorReads(transcript);
        transcript.push(
          { role: "assistant", content: turn.assistant ?? [] },
          {
            role: "user",
            results: [
              {
                id: searchId,
                path: "search",
                text: formatPhraseHits(searchPhraseText, hits),
              },
            ],
          },
        );
        continue;
      }
      const originId = turn.origin?.id;
      const originPath = turn.origin?.path;
      if (
        !finish &&
        turn.status === "origin" &&
        typeof originId === "string" &&
        typeof originPath === "string"
      ) {
        args.onOrigin?.(originPath);
        sources = rememberSource(sources, originPath);
        let text = `No origin link for ${originPath}`;
        try {
          const found = lookupOrigin({
            package: bundled.packagePath,
            path: originPath,
          });
          if (found.originUri) text = found.originUri;
        } catch (err) {
          text = err instanceof Error ? err.message : String(err);
        }
        collapsePriorReads(transcript);
        transcript.push(
          { role: "assistant", content: turn.assistant ?? [] },
          {
            role: "user",
            results: [{ id: originId, path: originPath, text }],
          },
        );
        continue;
      }
      if (!finish && turn.status === "read" && requested?.id && requested.path) {
        const offset =
          typeof requested.offset === "number" && requested.offset > 0
            ? Math.floor(requested.offset)
            : 0;
        args.onRead?.(requested.path, offset);
        reads.push(requested.path);
        sources = rememberSource(sources, requested.path);
        const loaded = readFollow(bundled.packagePath, requested.path, offset);
        if ("error" in loaded) {
          void maybeReportActivity({
            type: "query",
            action: "query_follow_fail",
            status: "fail",
            path: args.package,
            createId: askId,
            quiet: true,
          });
        }
        collapsePriorReads(transcript);
        transcript.push(
          { role: "assistant", content: turn.assistant ?? [] },
          {
            role: "user",
            results: [
              {
                id: requested.id,
                path: requested.path,
                ...("error" in loaded
                  ? { error: loaded.error }
                  : { text: formatFollowWindow(loaded) }),
              },
            ],
          },
        );
        continue;
      }
      const answer = turn.answer?.trim() ?? "";
      if (!answer) throw new Error("Claude returned an empty answer");
      if (isIncompleteAskAnswer(answer)) {
        void maybeReportActivity({
          type: "query",
          action: "query_client_reject",
          status: "fail",
          path: args.package,
          createId: askId,
          count: round,
          quiet: true,
        });
        throw new Error(askFailureMessage("incomplete answer"));
      }
      answered = true;
      return {
        answer,
        reads,
        searches,
        sources,
        passages: bundled.passages,
        gaps: bundled.gaps,
        model,
        creditsCharged,
        creditsRemaining,
        creditsUnlimited,
      };
    }
    throw new Error("Claude returned an empty answer");
  } finally {
    if (!answered) {
      void maybeReportActivity({
        type: "query",
        action: "query_session_no_answer",
        status: "fail",
        path: args.package,
        createId: askId,
        quiet: true,
      });
    }
  }
}
