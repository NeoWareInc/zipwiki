/** Prepaid credit billing constants and helpers. */

export const CREDITS_PER_DOLLAR = 100;
export const MIN_USD_CENTS = 500; // $5.00
export const MAX_USD_CENTS = 1_000_000; // $10,000.00
export const DEFAULT_USD_CENTS = 1_000; // $10.00
export const LOW_CREDITS_THRESHOLD = 500; // $5 equivalent
export const CREDIT_COST_PARSE = 1;
export const CREDIT_COST_LLM = 1;
/** LlamaParse overage price: $1.25 per 1,000 Llama credits. */
export const LLAMA_USD_PER_1000_CREDITS = 1.25;

/**
 * ZipWiki credits to debit for one LlamaParse job.
 * $1.25 / 1,000 Llama credits, sold at 100 ZipWiki credits per dollar.
 * Any job Llama billed costs at least 1 ZipWiki credit.
 */
export function zipwikiCreditsForLlamaCredits(llamaCredits: number): number {
  if (!Number.isFinite(llamaCredits) || llamaCredits <= 0) return 0;
  const raw = (llamaCredits * LLAMA_USD_PER_1000_CREDITS * CREDITS_PER_DOLLAR) / 1000;
  return Math.max(1, Math.ceil(raw - 1e-9));
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
