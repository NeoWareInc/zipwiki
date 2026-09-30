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
  kind: v.union(v.literal("okf"), v.literal("parsed")),
  text: v.string(),
  documents: v.optional(v.array(v.string())),
});

export const ask = action({
  args: {
    question: v.string(),
    filename: v.optional(v.string()),
    excerpts: v.array(excerptValidator),
  },
  returns: v.object({
    answer: v.string(),
    model: v.string(),
    creditsCharged: v.number(),
    creditsRemaining: v.number(),
    creditsUnlimited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const question = args.question.trim().slice(0, QUESTION_CHARS);
    if (!question) throw new Error("question is required");
    const excerpts = args.excerpts.slice(0, 3).map((excerpt) => ({
      path: excerpt.path.slice(0, 512),
      title: excerpt.title?.slice(0, 240),
      kind: excerpt.kind,
      text: excerpt.text.slice(0, BODY_CHARS),
      documents: (excerpt.documents ?? [])
        .filter((path) => path.trim())
        .slice(0, 8)
        .map((path) => path.slice(0, 512)),
    }));
    if (excerpts.length === 0 || excerpts.every((excerpt) => !excerpt.text.trim())) {
      throw new Error("no_excerpts");
    }

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

    const apiUrl = (process.env.ZIPWIKI_API_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
    const workerSecret = process.env.ZIPWIKI_WORKER_SECRET?.trim();
    if (!apiUrl || !workerSecret) throw new Error("anthropic_not_configured");

    const res = await fetch(`${apiUrl}/api/query/answer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zipwiki-worker-secret": workerSecret,
      },
      body: JSON.stringify({ question, excerpts }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      answer?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    };
    if (!res.ok) {
      if (body.error === "anthropic_not_configured") {
        throw new Error("anthropic_not_configured");
      }
      throw new Error(body.error || `Query API failed (${res.status})`);
    }
    const answer = body.answer?.trim() ?? "";
    if (!answer) throw new Error("Claude returned an empty answer");

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
      answer,
      model,
      creditsCharged: billed.creditsCharged,
      creditsRemaining: billed.creditsRemaining,
      creditsUnlimited: billed.creditsUnlimited,
    };
  },
});
