/**
 * Client-side mirror of hosted parse/OKF soft-fallback rules.
 * maxParsesPerMonth = billable LlamaParse docs; LiteParse is never billed.
 */

export type ClientPlanCaps = {
  slug: string;
  maxParsesPerMonth: number;
  maxOkfPerMonth: number;
};

export type ClientUsage = {
  parseCount: number;
  okfCount: number;
};

export function hasLlamaParseQuota(
  plan: ClientPlanCaps,
  usage: ClientUsage | null | undefined,
): boolean {
  if (plan.slug === "free" || plan.maxParsesPerMonth <= 0) return false;
  const used = usage?.parseCount ?? 0;
  return used < plan.maxParsesPerMonth;
}

export function hasZipcodexOkfQuota(
  plan: ClientPlanCaps,
  usage: ClientUsage | null | undefined,
): boolean {
  if (plan.slug === "free" || plan.maxOkfPerMonth <= 0) return false;
  const used = usage?.okfCount ?? 0;
  return used < plan.maxOkfPerMonth;
}
