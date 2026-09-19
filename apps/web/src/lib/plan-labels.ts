/** Display plan quotas; Custom uses MAX_SAFE_INTEGER as no limit. */
export function formatPlanQuota(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= Number.MAX_SAFE_INTEGER) return "no limit";
  return n.toLocaleString();
}

/** Admin / billing display order: Free → Standard → Pro → Unlimited. */
const PLAN_ORDER: Record<string, number> = {
  free: 0,
  standard: 1,
  pro: 2,
  custom: 3,
};

export function sortPlansByTier<T extends { slug: string }>(plans: T[]): T[] {
  return plans.slice().sort((a, b) => {
    const ao = PLAN_ORDER[a.slug] ?? 99;
    const bo = PLAN_ORDER[b.slug] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.slug.localeCompare(b.slug);
  });
}

/** Short label for admin plan pickers. */
export function planOptionLabel(plan: {
  slug: string;
  name: string;
}): string {
  switch (plan.slug) {
    case "free":
      return "Free — LiteParse";
    case "standard":
      return "Standard — 2,000 docs";
    case "pro":
      return "Pro — 20,000 docs";
    case "custom":
      return "Unlimited";
    default:
      return plan.name;
  }
}

/** One-line entitlement blurb for account detail. */
export function planEntitlementBlurb(plan: {
  slug: string;
  maxParses?: number;
  maxOkf?: number;
  maxParsesPerMonth?: number;
  maxOkfPerMonth?: number;
}): string {
  switch (plan.slug) {
    case "free":
      return "LiteParse only (not billed) · host-LLM OKF";
    case "standard":
      return "2,000 docs / mo · ≤100 pages/doc";
    case "pro":
      return "20,000 docs / mo · ≤1,000 pages/doc";
    case "custom":
      return "Unlimited hosted LlamaParse + ZipWiki OKF";
    default: {
      const parses = plan.maxParses ?? plan.maxParsesPerMonth;
      const okf = plan.maxOkf ?? plan.maxOkfPerMonth;
      return `${formatPlanQuota(parses)} docs / ${formatPlanQuota(okf)} OKF`;
    }
  }
}
