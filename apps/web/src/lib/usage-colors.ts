/** Visual kinds for billed / activity usage on the portal. */
export type UsageVisualKind = "parse" | "okf" | "query" | "other";

export function usageVisualKind(type: string): UsageVisualKind {
  if (type === "parse" || type === "liteparse" || type === "llamaparse_byo") {
    return "parse";
  }
  if (type === "okf") return "okf";
  if (
    type === "query" ||
    type === "pack" ||
    type === "pack_start" ||
    type === "pack_end"
  ) {
    return "query";
  }
  return "other";
}

/** Fill color for a usage kind (see --usage-* in index.css). */
export function usageColor(kind: UsageVisualKind): string {
  if (kind === "parse") return "var(--usage-parse)";
  if (kind === "okf") return "var(--usage-okf)";
  if (kind === "query") return "var(--usage-query)";
  return "var(--muted)";
}

/** Text color. Parsing stays darker so the credit figures stay readable. */
export function usageInk(kind: UsageVisualKind): string {
  if (kind === "parse") return "var(--usage-parse-ink)";
  return usageColor(kind);
}

export function usageKindLabel(kind: UsageVisualKind): string {
  if (kind === "parse") return "Parsing";
  if (kind === "okf") return "OKF Enrichment";
  if (kind === "query") return "Querying Knowledge Archive";
  return "Other";
}
