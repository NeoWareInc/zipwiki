import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_HOSTED_OKF_MODEL } from "./lib/credits";
import type { Id } from "./_generated/dataModel";

const BODY_CHARS = 12_000;
const QUESTION_CHARS = 2_000;

const excerptValidator = v.object({
  path: v.string(),
  title: v.optional(v.string()),
  kind: v.union(v.literal("okf"), v.literal("parsed"), v.literal("gap")),
  text: v.string(),
  documents: v.optional(v.array(v.string())),
});

function anomalyFromGatewayError(
  error: string | undefined,
  anomaly: string | undefined,
): string {
  if (typeof anomaly === "string" && anomaly.trim()) {
    return anomaly.trim().slice(0, 64);
  }
  const m = (error ?? "").trim();
  if (/narrated a search without calling a tool/i.test(m)) return "query_preamble";
  if (/incomplete answer/i.test(m) || /empty answer/i.test(m)) {
    return "query_incomplete";
  }
  if (/without a (path|phrase)/i.test(m)) return "query_incomplete";
  return "query_api_error";
}

export const ask = action({
  args: {
    question: v.string(),
    filename: v.optional(v.string()),
    excerpts: v.array(excerptValidator),
    /** Prior assistant tool call and the local read result, as JSON. */
    transcript: v.optional(v.string()),
    /** When true, the model must answer and cannot request another command. */
    finish: v.optional(v.boolean()),
    /** Per-Ask session id for correlating charges and anomaly rows. */
    askId: v.optional(v.string()),
    /** Zero-based turn index within the Ask loop. */
    round: v.optional(v.number()),
  },
  returns: v.object({
    status: v.union(
      v.literal("answer"),
      v.literal("read"),
      v.literal("search"),
      v.literal("origin"),
    ),
    answer: v.string(),
    reads: v.array(
      v.object({ id: v.string(), path: v.string(), offset: v.number() }),
    ),
    search: v.union(
      v.null(),
      v.object({ id: v.string(), phrase: v.string() }),
    ),
    origin: v.union(
      v.null(),
      v.object({ id: v.string(), path: v.string() }),
    ),
    assistant: v.string(),
    model: v.string(),
    creditsCharged: v.number(),
    creditsRemaining: v.number(),
    creditsUnlimited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const askId =
      typeof args.askId === "string" && args.askId.trim()
        ? args.askId.trim().slice(0, 128)
        : undefined;

    const question = args.question.trim().slice(0, QUESTION_CHARS);
    if (!question) throw new Error("question is required");
    let transcript: unknown[] | undefined;
    if (args.transcript?.trim()) {
      try {
        const parsed = JSON.parse(args.transcript.slice(0, 200_000)) as unknown;
        if (!Array.isArray(parsed)) throw new Error("invalid_transcript");
        transcript = parsed.slice(0, 8);
      } catch {
        throw new Error("invalid_transcript");
      }
    }

    const excerpts = args.excerpts.slice(0, 9).map((excerpt) => ({
      path: excerpt.path.slice(0, 512),
      title: excerpt.title?.slice(0, 240),
      kind: excerpt.kind,
      text: excerpt.text.slice(0, BODY_CHARS),
      documents: (excerpt.documents ?? [])
        .filter((path) => path.trim())
        .slice(0, 8)
        .map((path) => path.slice(0, 512)),
    }));

    const billing: {
      accountId: Id<"accounts">;
      disabled: boolean;
      creditsRemaining: number;
      creditsUnlimited: boolean;
      creditsLocked: boolean;
    } | null = await ctx.runQuery(internal.usage.queryBilling, { userId });
    if (!billing) throw new Error("No account");
    if (billing.disabled) throw new Error("account_disabled");
    if (billing.creditsLocked) throw new Error("credits_locked");
    if (!billing.creditsUnlimited && billing.creditsRemaining < 1) {
      throw new Error("credits_exhausted");
    }

    const recordAnomaly = async (engine: string) => {
      await ctx.runMutation(internal.usage.recordQueryAnomaly, {
        accountId: billing.accountId,
        engine,
        createId: askId,
        filename: args.filename,
        pages:
          typeof args.round === "number"
            ? Math.max(0, Math.floor(args.round))
            : undefined,
      });
    };

    if (excerpts.length === 0 || excerpts.every((excerpt) => !excerpt.text.trim())) {
      await recordAnomaly("query_no_excerpts");
      throw new Error("no_excerpts");
    }

    const apiUrl = (process.env.ZIPWIKI_API_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
    const workerSecret = process.env.ZIPWIKI_WORKER_SECRET?.trim();
    if (!apiUrl || !workerSecret) {
      await recordAnomaly("query_api_error");
      throw new Error("anthropic_not_configured");
    }

    const res = await fetch(`${apiUrl}/api/query/answer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zipwiki-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        question,
        excerpts,
        ...(transcript ? { transcript } : {}),
        ...(args.finish ? { finish: true } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      anomaly?: string;
      status?: string;
      answer?: string;
      reads?: Array<{ id?: string; path?: string; offset?: number }>;
      search?: { id?: string; phrase?: string } | null;
      origin?: { id?: string; path?: string } | null;
      assistant?: unknown;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    };
    if (!res.ok) {
      if (body.error === "anthropic_not_configured") {
        await recordAnomaly("query_api_error");
        throw new Error("anthropic_not_configured");
      }
      await recordAnomaly(anomalyFromGatewayError(body.error, body.anomaly));
      throw new Error(body.error || `Query API failed (${res.status})`);
    }
    const status: "answer" | "read" | "search" | "origin" =
      body.status === "read"
        ? "read"
        : body.status === "search"
          ? "search"
          : body.status === "origin"
            ? "origin"
            : "answer";
    const reads = (body.reads ?? [])
      .filter((read) => typeof read.id === "string" && typeof read.path === "string")
      .slice(0, 1)
      .map((read) => ({
        id: read.id as string,
        path: read.path as string,
        offset:
          typeof read.offset === "number" && Number.isFinite(read.offset) && read.offset > 0
            ? Math.floor(read.offset)
            : 0,
      }));
    const search =
      status === "search" &&
      typeof body.search?.id === "string" &&
      typeof body.search.phrase === "string"
        ? { id: body.search.id, phrase: body.search.phrase }
        : null;
    const origin =
      status === "origin" &&
      typeof body.origin?.id === "string" &&
      typeof body.origin.path === "string"
        ? { id: body.origin.id, path: body.origin.path }
        : null;
    const answer = body.answer?.trim() ?? "";
    if (status === "answer" && !answer) {
      await recordAnomaly("query_incomplete");
      throw new Error("Claude returned an empty answer");
    }
    if (status === "read" && reads.length === 0) {
      await recordAnomaly("query_incomplete");
      throw new Error("Claude requested a read without a path");
    }
    if (status === "search" && !search) {
      await recordAnomaly("query_incomplete");
      throw new Error("Claude requested a search without a phrase");
    }
    if (status === "origin" && !origin) {
      await recordAnomaly("query_incomplete");
      throw new Error("Claude requested an origin link without a path");
    }

    const model = body.model ?? DEFAULT_HOSTED_OKF_MODEL;
    const billed: {
      creditsCharged: number;
      creditsRemaining: number;
      creditsUnlimited: boolean;
    } = await ctx.runMutation(internal.usage.recordQueryDebit, {
      accountId: billing.accountId,
      model,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      filename: args.filename,
    });

    return {
      status,
      answer,
      reads,
      search,
      origin,
      assistant: JSON.stringify(body.assistant ?? []),
      model,
      creditsCharged: billed.creditsCharged,
      creditsRemaining: billed.creditsRemaining,
      creditsUnlimited: billed.creditsUnlimited,
    };
  },
});
