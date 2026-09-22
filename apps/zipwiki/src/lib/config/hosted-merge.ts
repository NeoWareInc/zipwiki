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

function formatQuota(used: number, max: number): string {
  if (max <= 0) return `${used}/0 (none)`;
  if (max >= Number.MAX_SAFE_INTEGER) return `${used}/no limit`;
  return `${used}/${max} (remaining ${Math.max(0, max - used)})`;
}

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
  };
}

/** Human-readable plan usage line for stderr. */
export function formatClientUsageSummary(
  config: ClientConfig,
  label = "usage",
  previous?: ClientConfig | null,
): string {
  const cur = usageSlice(config);
  const balance = creditBalance(config);
  const creditLabel = balance.creditsUnlimited
    ? "unlimited"
    : String(balance.creditsRemaining);
  let line =
    `[zipwiki] ${label} credits=${creditLabel} ` +
    `LiteParse ${cur.liteOk} ok / ${cur.liteFail} fail · ` +
    `LlamaParse ${formatQuota(cur.parse, config.plan.maxParsesPerMonth)} · ` +
    `ZipWiki OKF ${formatQuota(cur.okf, config.plan.maxOkfPerMonth)}`;

  if (previous?.usage) {
    const prev = usageSlice(previous);
    const parts: string[] = [];
    const dLite = cur.liteOk - prev.liteOk;
    const dLiteFail = cur.liteFail - prev.liteFail;
    const dParse = cur.parse - prev.parse;
    const dOkf = cur.okf - prev.okf;
    if (dLite !== 0) parts.push(`LiteParse +${dLite}`);
    if (dLiteFail !== 0) parts.push(`LiteParse fail +${dLiteFail}`);
    if (dParse !== 0) parts.push(`LlamaParse +${dParse}`);
    if (dOkf !== 0) parts.push(`OKF +${dOkf}`);
    if (parts.length > 0) {
      line += ` · this run: ${parts.join(", ")}`;
    } else {
      line += " · this run: no billed/telemetry change";
    }
  }

  return line;
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
