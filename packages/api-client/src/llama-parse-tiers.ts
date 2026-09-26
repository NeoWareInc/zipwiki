/**
 * LlamaParse v2 Parse tiers (markdown / archive packing).
 * @see https://developers.llamaindex.ai/llamaparse/parse/guides/tiers/
 * @see https://developers.llamaindex.ai/llamaparse/general/pricing/
 *
 * Note: LlamaIndex “Turbo” (35 credits/page) is an Extract tier — it skips
 * Parse and produces no markdown. ZipWiki Knowledge Archives need Parse
 * output, so Turbo is not offered here.
 */

export const LLAMA_PARSE_TIERS = [
  "cost_effective",
  "agentic",
  "agentic_plus",
] as const;

export type LlamaParseTier = (typeof LLAMA_PARSE_TIERS)[number];

/** Fastest Parse tier that still returns markdown (ZipWiki default). */
export const DEFAULT_LLAMA_PARSE_TIER: LlamaParseTier = "cost_effective";

export type LlamaParseTierInfo = {
  id: LlamaParseTier;
  label: string;
  /** LlamaParse vendor credits billed per page. */
  llamaCreditsPerPage: number;
  blurb: string;
};

/**
 * Parse tiers ZipWiki offers. `fast` is omitted — it cannot expand markdown
 * (required for wiki/parsed/).
 */
export const LLAMA_PARSE_TIER_INFO: Record<LlamaParseTier, LlamaParseTierInfo> =
  {
    cost_effective: {
      id: "cost_effective",
      label: "Cost Effective",
      llamaCreditsPerPage: 3,
      blurb: "Clean markdown for text-heavy docs — fastest markdown tier",
    },
    agentic: {
      id: "agentic",
      label: "Agentic",
      llamaCreditsPerPage: 10,
      blurb: "Scans, tables, multi-column layouts",
    },
    agentic_plus: {
      id: "agentic_plus",
      label: "Agentic Plus",
      llamaCreditsPerPage: 45,
      blurb: "Highest accuracy for dense / mission-critical PDFs",
    },
  };

export function isLlamaParseTier(value: string): value is LlamaParseTier {
  return (LLAMA_PARSE_TIERS as readonly string[]).includes(value);
}

export function resolveLlamaParseTier(
  value?: string | null,
): LlamaParseTier {
  const trimmed = value?.trim();
  if (trimmed && isLlamaParseTier(trimmed)) return trimmed;
  // Legacy / mistaken “turbo” maps to fastest markdown Parse tier.
  if (trimmed === "turbo" || trimmed === "fast") {
    return DEFAULT_LLAMA_PARSE_TIER;
  }
  return DEFAULT_LLAMA_PARSE_TIER;
}

export function llamaCreditsPerPageForTier(tier?: string | null): number {
  return LLAMA_PARSE_TIER_INFO[resolveLlamaParseTier(tier)].llamaCreditsPerPage;
}

/**
 * Approximate ZipWiki credits billed per page for a Parse tier
 * ($1.25 / 1k Llama credits × 20% margin × 100 ZipWiki credits/$).
 * Actual debit uses the job’s recorded Llama credits (ceil ≥ 1).
 */
export function approxZipwikiCreditsPerPage(tier?: string | null): number {
  const llama = llamaCreditsPerPageForTier(tier);
  const usdPerPage = (llama * 1.25) / 1000;
  const sell = usdPerPage * (1 / (1 - 0.2));
  return Math.max(1, Math.ceil(sell * 100 - 1e-9));
}

export function llamaParseTierSelectOptions(): Array<{
  value: LlamaParseTier;
  label: string;
}> {
  return LLAMA_PARSE_TIERS.map((id) => {
    const info = LLAMA_PARSE_TIER_INFO[id];
    const zw = approxZipwikiCreditsPerPage(id);
    return {
      value: id,
      label: `${info.label} · ~${zw} ZipWiki ¢/page (${info.llamaCreditsPerPage} Llama) — ${info.blurb}`,
    };
  });
}
