import {
  fetchClientConfig,
  type ClientConfig,
} from "@zipwiki/api-client";
import type { ResolvedZipwikiConfig } from "./schema.js";
import {
  isRemoteOkfMode,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "./api.js";
import {
  hasLlamaParseQuota,
  hasZipcodexOkfQuota,
} from "./entitlements.js";

export type HostedClientConfigResult = {
  config: ClientConfig;
  /** True when prepaid credits are running low. */
  nearQuota: boolean;
  /** Forced LiteParse (no hosted parse credits). */
  liteparseFallback: boolean;
  /** ZipWiki hosted OKF not billable — use host LLM / skip. */
  okfHostFallback: boolean;
};

function creditBalance(config: ClientConfig) {
  return {
    creditsRemaining:
      config.creditsRemaining ??
      (config.plan.slug === "unlimited"
        ? Number.MAX_SAFE_INTEGER
        : config.plan.maxParsesPerMonth),
    creditsUnlimited:
      config.creditsUnlimited === true || config.plan.slug === "unlimited",
  };
}

function usageSlice(config: ClientConfig) {
  return {
    parse: config.usage?.parseCount ?? 0,
    okf: config.usage?.okfCount ?? 0,
    liteOk: config.usage?.liteparseSuccessCount ?? 0,
    liteFail: config.usage?.liteparseFailCount ?? 0,
    parseCredits: config.usage?.parseCreditsSpent ?? 0,
    okfCredits: config.usage?.okfCreditsSpent ?? 0,
    byoCount: config.usage?.byoLlamaCount ?? 0,
    byoCredits: config.usage?.byoLlamaCredits ?? 0,
  };
}

function ownKeyLine(files: number, llamaCredits: number): string {
  const label = "LlamaParse".padEnd(12);
  const amount =
    llamaCredits > 0
      ? ` · ${llamaCredits} Llama credit${llamaCredits === 1 ? "" : "s"} (your key)`
      : " (your key)";
  return `[zipwiki]   ${label} ${files} file${files === 1 ? "" : "s"}${amount}`;
}

function serviceLine(
  name: string,
  files: number,
  credits: number | null,
): string {
  const label = name.padEnd(12);
  if (credits == null || credits <= 0) {
    return `[zipwiki]   ${label} ${files} file${files === 1 ? "" : "s"}`;
  }
  return (
    `[zipwiki]   ${label} ${files} file${files === 1 ? "" : "s"} · ` +
    `${credits} credit${credits === 1 ? "" : "s"}`
  );
}

/** Human-readable plan usage for stderr (multi-line). */
export function formatClientUsageSummary(
  config: ClientConfig,
  label = "usage",
  previous?: ClientConfig | null,
): string {
  const balance = creditBalance(config);
  const creditLabel = balance.creditsUnlimited
    ? "unlimited"
    : String(balance.creditsRemaining);

  // Before a pack: only the balance — usage breakdown belongs at the end.
  if (label === "start") {
    return `[zipwiki] credits available ${creditLabel}`;
  }

  const lines = [`[zipwiki] ${label}`];

  if (previous?.usage && config.usage) {
    const cur = usageSlice(config);
    const prev = usageSlice(previous);
    const dLite = cur.liteOk - prev.liteOk;
    const dParse = cur.parse - prev.parse;
    const dOkf = cur.okf - prev.okf;
    const dParseCredits = cur.parseCredits - prev.parseCredits;
    const dOkfCredits = cur.okfCredits - prev.okfCredits;
    const dByo = cur.byoCount - prev.byoCount;
    const dByoCredits = cur.byoCredits - prev.byoCredits;

    if (dLite > 0) {
      lines.push(serviceLine("LiteParse", dLite, null));
    }
    if (dByo > 0) {
      lines.push(ownKeyLine(dByo, dByoCredits));
    }
    if (dParse > 0) {
      lines.push(serviceLine("LlamaParse", dParse, dParseCredits));
    }
    if (dOkf > 0) {
      lines.push(serviceLine("ZipWiki OKF", dOkf, dOkfCredits));
    }
  }

  lines.push(`[zipwiki]   ${"remaining".padEnd(12)} ${creditLabel}`);
  return lines.join("\n");
}

export function printClientUsageSummary(
  config: ClientConfig,
  label = "usage",
  previous?: ClientConfig | null,
): void {
  console.error(formatClientUsageSummary(config, label, previous));
}

/**
 * Re-fetch client-config (bypass cache) and print current usage.
 * Soft-fails on network errors.
 */
export async function refreshAndPrintClientUsage(
  label: string,
  opts?: { quiet?: boolean; previous?: ClientConfig | null },
): Promise<ClientConfig | null> {
  if (opts?.quiet) return null;
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) return null;
  try {
    const config = await fetchClientConfig(url, key, { bypassCache: true });
    printClientUsageSummary(config, label, opts?.previous);
    return config;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Could not refresh usage (${msg})`);
    return null;
  }
}

/**
 * When ZIPWIKI_API_URL + API key are set, fetch server config, print usage,
 * and merge caps/defaults into the in-memory project config.
 * Soft-fails (returns null) on network errors.
 */
export async function applyHostedClientConfig(
  project: ResolvedZipwikiConfig,
  opts?: { quiet?: boolean },
): Promise<HostedClientConfigResult | null> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) return null;

  let config: ClientConfig;
  try {
    config = await fetchClientConfig(url, key);
  } catch (err) {
    if (!opts?.quiet) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[zipwiki] client-config unavailable: ${msg}`);
    }
    return null;
  }

  const balance = creditBalance(config);
  const liteparseFallback = !hasLlamaParseQuota(balance);
  const okfHostFallback = !hasZipcodexOkfQuota(balance);

  if (!opts?.quiet) {
    printClientUsageSummary(config, "start");
  }

  if (liteparseFallback && project.parser.engine !== "llamaparse") {
    project.parser.engine = "liteparse";
    project.parser.mode = "fixed";
    project.parser.escalate.enabled = false;
    if (!opts?.quiet) {
      console.error(
        "[zipwiki] No hosted parse credits — using LiteParse (unlimited, not billed)",
      );
    }
  } else if (liteparseFallback && !opts?.quiet) {
    console.error(
      "[zipwiki] No hosted parse credits — keeping LlamaParse from your settings.",
    );
  }

  if (!process.env.ZIPWIKI_OKF_MODEL?.trim() && config.okf.model) {
    project.okf.model = config.okf.model;
  }

  // Clamp pages only when billable LlamaParse remains
  const maxPages = config.plan.maxPagesPerDocument;
  if (!liteparseFallback && maxPages != null && maxPages > 0) {
    const current = project.parser.liteparse.maxPages;
    if (current == null || current > maxPages) {
      project.parser.liteparse.maxPages = maxPages;
    }
  }

  let nearQuota = false;
  if (!liteparseFallback && !balance.creditsUnlimited) {
    nearQuota = balance.creditsRemaining <= 500;
    if (nearQuota && !opts?.quiet) {
      console.error(
        `[zipwiki] Warning: credits running low (${balance.creditsRemaining} remaining). Extra usage falls back to LiteParse + host LLM.`,
      );
    }
  }

  if (okfHostFallback && isRemoteOkfMode() && !opts?.quiet) {
    console.error(
      "[zipwiki] ZipWiki OKF unavailable without credits — pack will skip AI OKF or use host-LLM (okf_enrich).",
    );
  }

  return { config, nearQuota, liteparseFallback, okfHostFallback };
}
