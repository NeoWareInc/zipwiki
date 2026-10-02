/**
 * Hosted package question. The archive stays local. The model may search
 * for a phrase or read stored text, up to four times, on this package.
 */
import { basename } from "node:path";
import {
  formatFollowWindow,
  formatPhraseHits,
  queryArchive,
  readFollow,
  searchPhrase,
} from "./evidence.js";
import { lookupOrigin } from "./origin.js";
import type { EvidenceGap } from "./search.js";

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
  searches: string[];
  gaps: EvidenceGap[];
  model: string;
  creditsCharged: number;
  creditsRemaining: number;
  creditsUnlimited: boolean;
};

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
    return {
      answer: "No concept matched this question.",
      reads: [],
      searches: [],
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
  let model = "";
  const reads: string[] = [];
  const searches: string[] = [];
  const transcript: Array<
    | { role: "assistant"; content: unknown[] }
    | {
        role: "user";
        results: Array<{ id: string; path: string; text?: string; error?: string }>;
      }
  > = [];
  for (let round = 0; round < 5; round += 1) {
    const turn = await postTurn(args.apiUrl, args.apiKey, fetchImpl, {
      question,
      filename,
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
      let text = `No origin link for ${originPath}`;
      try {
        const found = lookupOrigin({ package: bundled.packagePath, path: originPath });
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
      const loaded = readFollow(bundled.packagePath, requested.path, offset);
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
    return {
      answer,
      reads,
      searches,
      gaps: bundled.gaps,
      model,
      creditsCharged,
      creditsRemaining,
      creditsUnlimited,
    };
  }
  throw new Error("Claude returned an empty answer");
}
