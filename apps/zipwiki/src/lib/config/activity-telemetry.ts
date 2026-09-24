import { basename } from "node:path";
import { reportActivityTelemetry } from "@zipwiki/api-client";
import {
  resolveZipwikiApiKey,
  resolveZipwikiApiTarget,
  resolveZipwikiApiUrl,
  zipwikiDeviceAuthUrl,
} from "./api.js";

export type ActivityReportInput = {
  type: "pack" | "query";
  /** Query subtype: open | search | query | list | … */
  action?: string;
  status?: "success" | "fail" | string;
  /** Package or output path. */
  path?: string;
  bytes?: number;
  /** Pack: documents. Query: hits when known. */
  count?: number;
  quiet?: boolean;
};

/**
 * Soft-report pack / query activity when signed in. Never throws to callers.
 * Tries Fly API first, then Convex device-auth host.
 */
export async function maybeReportActivity(
  input: ActivityReportInput,
): Promise<void> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) return;

  const payload = {
    type: input.type,
    engine: input.action,
    status: input.status ?? "success",
    filename: input.path ? basename(input.path) : undefined,
    bytes: input.bytes,
    pages: input.count,
  };

  const target = resolveZipwikiApiTarget(url) ?? "dev";
  const convexSite = zipwikiDeviceAuthUrl(target);
  const hosts = [url, convexSite]
    .map((h) => h.replace(/\/+$/, ""))
    .filter((h, i, all) => all.indexOf(h) === i);

  let lastErr: unknown;
  for (const host of hosts) {
    try {
      await reportActivityTelemetry(host, key, payload);
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!input.quiet && lastErr) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.error(`[zipwiki] activity log: ${msg}`);
  }
}
