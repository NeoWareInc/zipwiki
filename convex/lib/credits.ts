/** Prepaid credit billing constants and helpers. */

export const CREDITS_PER_DOLLAR = 100;
export const MIN_USD_CENTS = 500; // $5.00
export const MAX_USD_CENTS = 1_000_000; // $10,000.00
export const DEFAULT_USD_CENTS = 1_000; // $10.00
export const LOW_CREDITS_THRESHOLD = 500; // $5 equivalent
export const CREDIT_COST_PARSE = 1;
export const CREDIT_COST_LLM = 1;

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
