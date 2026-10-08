/** Prepaid credit billing constants and helpers. */

export const CREDITS_PER_DOLLAR = 100;
export const MIN_USD_CENTS = 500; // $5.00
export const MAX_USD_CENTS = 1_000_000; // $10,000.00
export const DEFAULT_USD_CENTS = 1_000; // $10.00
export const LOW_CREDITS_THRESHOLD = 500; // $5 equivalent
export const CREDIT_COST_PARSE = 1;
/** Fallback hosted OKF debit when token counts are missing. */
export const CREDIT_COST_LLM = 1;
/** LlamaParse overage price: $1.25 per 1,000 Llama credits. */
export const LLAMA_USD_PER_1000_CREDITS = 1.25;
/**
 * Target gross margin on vendor resale (sell so profit / sell = 20%).
 * Markup on cost = 1 / (1 − margin) = 1.25×.
 * Used for LlamaParse and hosted Anthropic OKF.
 * @see https://developers.llamaindex.ai/llamaparse/general/pricing/
 */
export const TARGET_PROFIT_MARGIN = 0.2;
export const COST_MARKUP = 1 / (1 - TARGET_PROFIT_MARGIN);

/**
 * LlamaParse v2 Parse tiers (credits/page). Turbo is Extract-only — not listed.
 * @see https://developers.llamaindex.ai/llamaparse/general/pricing/
 */
export const LLAMA_PARSE_TIERS = [
  "cost_effective",
  "agentic",
  "agentic_plus",
] as const;
export type LlamaParseTier = (typeof LLAMA_PARSE_TIERS)[number];
export const DEFAULT_LLAMA_PARSE_TIER: LlamaParseTier = "cost_effective";
export const LLAMA_PARSE_TIER_CREDITS: Record<LlamaParseTier, number> = {
  cost_effective: 3,
  agentic: 10,
  agentic_plus: 45,
};
/** @deprecated Prefer LLAMA_PARSE_TIER_CREDITS.agentic */
export const LLAMA_AGENTIC_CREDITS_PER_PAGE =
  LLAMA_PARSE_TIER_CREDITS.agentic;

export function resolveLlamaParseTier(tier?: string | null): LlamaParseTier {
  const t = tier?.trim();
  if (t && (LLAMA_PARSE_TIERS as readonly string[]).includes(t)) {
    return t as LlamaParseTier;
  }
  if (t === "turbo" || t === "fast") return DEFAULT_LLAMA_PARSE_TIER;
  return DEFAULT_LLAMA_PARSE_TIER;
}

export function llamaCreditsPerPageForTier(tier?: string | null): number {
  return LLAMA_PARSE_TIER_CREDITS[resolveLlamaParseTier(tier)];
}

/** Default hosted ZipWiki OKF model (cheapest Claude). */
export const DEFAULT_HOSTED_OKF_MODEL = "claude-haiku-5-5";

export const HOSTED_OKF_MODELS = [
  "claude-haiku-5-5",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
] as const;

export type HostedOkfModel = (typeof HOSTED_OKF_MODELS)[number];

/**
 * Anthropic API list prices ($ / million tokens).
 * @see https://www.anthropic.com/pricing
 * Keep in sync with gateway allowlist in apps/server/src/gateway/anthropic.ts.
 */
export const ANTHROPIC_MODEL_PRICES: Record<
  HostedOkfModel,
  { inputUsdPerMTok: number; outputUsdPerMTok: number; label: string }
> = {
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
  },
  "claude-sonnet-4-5": {
    label: "Claude Sonnet 4.5",
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
  },
  "claude-opus-4-5": {
    label: "Claude Opus 4.5",
    inputUsdPerMTok: 15,
    outputUsdPerMTok: 75,
  },
};

export function isHostedOkfModel(model: string): model is HostedOkfModel {
  return (HOSTED_OKF_MODELS as readonly string[]).includes(model);
}

export function resolveHostedOkfModel(model?: string | null): HostedOkfModel {
  const trimmed = model?.trim();
  if (trimmed && isHostedOkfModel(trimmed)) return trimmed;
  return DEFAULT_HOSTED_OKF_MODEL;
}

/**
 * ZipWiki credits to debit for one hosted Anthropic OKF call.
 * USD = tokens/1e6 × list price, then × COST_MARKUP, × CREDITS_PER_DOLLAR.
 * Falls back to CREDIT_COST_LLM when tokens are missing. Any billed job ≥ 1.
 */
export function zipwikiCreditsForAnthropicTokens(args: {
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): number {
  const input =
    typeof args.inputTokens === "number" && Number.isFinite(args.inputTokens)
      ? Math.max(0, args.inputTokens)
      : 0;
  const output =
    typeof args.outputTokens === "number" && Number.isFinite(args.outputTokens)
      ? Math.max(0, args.outputTokens)
      : 0;
  if (input <= 0 && output <= 0) return CREDIT_COST_LLM;

  const model = resolveHostedOkfModel(args.model);
  const prices = ANTHROPIC_MODEL_PRICES[model];
  const usd =
    (input / 1_000_000) * prices.inputUsdPerMTok +
    (output / 1_000_000) * prices.outputUsdPerMTok;
  const raw = usd * COST_MARKUP * CREDITS_PER_DOLLAR;
  return Math.max(1, Math.ceil(raw - 1e-9));
}

/**
 * ZipWiki credits to debit for one LlamaParse job.
 * Cost = Llama credits × $1.25 / 1,000, then × markup for TARGET_PROFIT_MARGIN,
 * converted at 100 ZipWiki credits per dollar. Any billed job costs ≥ 1 credit.
 */
export function zipwikiCreditsForLlamaCredits(llamaCredits: number): number {
  if (!Number.isFinite(llamaCredits) || llamaCredits <= 0) return 0;
  const costCredits =
    (llamaCredits * LLAMA_USD_PER_1000_CREDITS * CREDITS_PER_DOLLAR) / 1000;
  const raw = costCredits * COST_MARKUP;
  return Math.max(1, Math.ceil(raw - 1e-9));
}

/**
 * Approximate pages covered by `usd` at TARGET_PROFIT_MARGIN for a Parse tier
 * (fractional sell rate; per-job ceil may yield slightly fewer pages).
 */
export function approxPagesForUsd(
  usd: number,
  tier: string | null = DEFAULT_LLAMA_PARSE_TIER,
): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const llamaPerPage = llamaCreditsPerPageForTier(tier);
  const costPerPage =
    (llamaPerPage * LLAMA_USD_PER_1000_CREDITS) / 1000;
  const sellPerPage = costPerPage * COST_MARKUP;
  return Math.floor(usd / sellPerPage + 1e-9);
}

/** @deprecated Prefer approxPagesForUsd(usd, tier). */
export function approxAgenticPagesForUsd(usd: number): number {
  return approxPagesForUsd(usd, "agentic");
}

export const CREDIT_PRESETS_USD = [5, 10, 25, 50, 100] as const;

export function clampUsdCents(usdCents: number): number {
  if (!Number.isFinite(usdCents)) return DEFAULT_USD_CENTS;
  const rounded = Math.round(usdCents);
  return Math.min(MAX_USD_CENTS, Math.max(MIN_USD_CENTS, rounded));
}

/** credits = round(dollars * 100) */
export function creditsForUsdCents(usdCents: number): number {
  const cents = clampUsdCents(usdCents);
  return Math.round((cents / 100) * CREDITS_PER_DOLLAR);
}

export function remainingCredits(account: {
  creditsPurchased?: number;
  creditsSpent?: number;
  creditsUnlimited?: boolean;
}): number {
  if (account.creditsUnlimited) return Number.MAX_SAFE_INTEGER;
  const purchased = account.creditsPurchased ?? 0;
  const spent = account.creditsSpent ?? 0;
  return Math.max(0, purchased - spent);
}

/** True when hosted credit spend must be refused. */
export function creditsSpendBlocked(args: {
  accountLocked?: boolean;
  globalLocked?: boolean;
}): boolean {
  return args.accountLocked === true || args.globalLocked === true;
}

export function isLowCredits(remaining: number, unlimited?: boolean): boolean {
  if (unlimited) return false;
  return remaining <= LOW_CREDITS_THRESHOLD;
}

/** A debit that moves the balance from above the warning line to at or below it. */
export function crossedLowCreditThreshold(args: {
  before: number;
  after: number;
  unlimited?: boolean;
  notifiedAt?: number;
}): boolean {
  if (args.unlimited) return false;
  if (args.notifiedAt) return false;
  return (
    args.before > LOW_CREDITS_THRESHOLD && args.after <= LOW_CREDITS_THRESHOLD
  );
}

/** Off-session reload is in flight for this long before another attempt is allowed. */
export const AUTO_RELOAD_STALE_MS = 15 * 60 * 1000;

export function shouldStartAutoReload(args: {
  enabled?: boolean;
  remaining: number;
  threshold?: number;
  pending?: boolean;
  pendingAt?: number;
  hasPaymentMethod: boolean;
  unlimited?: boolean;
  now: number;
}): boolean {
  if (args.unlimited || !args.enabled || !args.hasPaymentMethod) return false;
  const threshold = args.threshold;
  if (threshold === undefined || !Number.isFinite(threshold)) return false;
  if (args.remaining >= threshold) return false;
  if (
    args.pending &&
    args.pendingAt !== undefined &&
    args.now - args.pendingAt < AUTO_RELOAD_STALE_MS
  ) {
    return false;
  }
  return true;
}

export type CreditAccountFields = {
  creditsPurchased?: number;
  creditsSpent?: number;
  creditsUnlimited?: boolean;
};

/** Prepaid-credit view plus a synthetic `plan` for older CLI/config clients. */
export function creditSnapshot(account: CreditAccountFields) {
  const unlimited = account.creditsUnlimited === true;
  const remaining = remainingCredits(account);
  return {
    creditsPurchased: account.creditsPurchased ?? 0,
    creditsSpent: account.creditsSpent ?? 0,
    creditsRemaining: remaining,
    creditsUnlimited: unlimited,
    plan: {
      slug: unlimited ? "unlimited" : remaining > 0 ? "credits" : "free",
      name: unlimited
        ? "Unlimited"
        : remaining > 0
          ? "Prepaid credits"
          : "Free",
      maxParsesPerMonth: unlimited ? Number.MAX_SAFE_INTEGER : remaining,
      maxOkfPerMonth: unlimited ? Number.MAX_SAFE_INTEGER : remaining,
      maxPagesPerDocument: null as number | null,
    },
  };
}
