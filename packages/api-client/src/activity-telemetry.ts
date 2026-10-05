import { apiFetch } from "./client-config.js";

export type ActivityTelemetryInput = {
  type: "pack_start" | "pack_end" | "pack" | "query";
  /** Subtype for query: open | search | query | list | … */
  engine?: string;
  status?: string;
  filename?: string;
  bytes?: number;
  /** Pack: document count. Query: hit count when known. */
  pages?: number;
  /** Create ZipWiki session id (links start/end + step log). */
  createId?: string;
  /** End Create totals (authoritative; not summed from steps). */
  creditCost?: number;
  llamaCredits?: number;
  inputTokens?: number;
  outputTokens?: number;
  okfCount?: number;
  parseCount?: number;
};

/** Report pack / query activity; does not debit credits. */
export async function reportActivityTelemetry(
  baseUrl: string,
  apiKey: string,
  input: ActivityTelemetryInput,
): Promise<void> {
  const res = await apiFetch(baseUrl, "/api/telemetry/activity", {
    method: "POST",
    apiKey,
    body: JSON.stringify({
      type: input.type,
      engine: input.engine,
      status: input.status,
      filename: input.filename,
      bytes: input.bytes,
      pages: input.pages,
      createId: input.createId,
      creditCost: input.creditCost,
      llamaCredits: input.llamaCredits,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      okfCount: input.okfCount,
      parseCount: input.parseCount,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `activity telemetry failed: ${res.status} ${text.slice(0, 120)}`,
    );
  }
}
