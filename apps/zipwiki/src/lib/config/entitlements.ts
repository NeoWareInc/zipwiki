/**
 * Client-side mirror of hosted parse/OKF soft-fallback rules.
 * Hosted usage requires prepaid credits (or unlimited). LiteParse is never billed.
 */

export type ClientCreditBalance = {
  creditsRemaining: number;
  creditsUnlimited?: boolean;
};

/** @deprecated Prefer ClientCreditBalance — kept for callers with plan caps. */
export type ClientPlanCaps = {
  slug: string;
  maxParsesPerMonth: number;
  maxOkfPerMonth: number;
};

export type ClientUsage = {
  parseCount: number;
  okfCount: number;
};

export function hasHostedCredits(
  balance: ClientCreditBalance | null | undefined,
  cost = 1,
): boolean {
  if (!balance) return false;
  if (balance.creditsUnlimited) return true;
  return (balance.creditsRemaining ?? 0) >= cost;
}

export function hasLlamaParseQuota(
  planOrBalance: ClientPlanCaps | ClientCreditBalance,
  usage?: ClientUsage | null,
): boolean {
  if ("creditsRemaining" in planOrBalance || "creditsUnlimited" in planOrBalance) {
    return hasHostedCredits(planOrBalance as ClientCreditBalance);
  }
  const plan = planOrBalance as ClientPlanCaps;
  // Legacy monthly-quota path (unused once credits ship).
  if (plan.slug === "free" || plan.maxParsesPerMonth <= 0) return false;
  const used = usage?.parseCount ?? 0;
  return used < plan.maxParsesPerMonth;
}

export function hasZipcodexOkfQuota(
  planOrBalance: ClientPlanCaps | ClientCreditBalance,
  usage?: ClientUsage | null,
): boolean {
  if ("creditsRemaining" in planOrBalance || "creditsUnlimited" in planOrBalance) {
    return hasHostedCredits(planOrBalance as ClientCreditBalance);
  }
  const plan = planOrBalance as ClientPlanCaps;
  if (plan.slug === "free" || plan.maxOkfPerMonth <= 0) return false;
  const used = usage?.okfCount ?? 0;
  return used < plan.maxOkfPerMonth;
}
