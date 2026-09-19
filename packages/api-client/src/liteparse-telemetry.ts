import { apiFetch } from "./client-config.js";

/** Report a local LiteParse outcome; does not count toward billed parse quota. */
export async function reportLiteParseTelemetry(
  baseUrl: string,
  apiKey: string,
  input: { success: boolean; bytes?: number },
): Promise<void> {
  const res = await apiFetch(baseUrl, "/api/telemetry/liteparse", {
    method: "POST",
    apiKey,
    body: JSON.stringify({
      success: input.success,
      bytes: input.bytes,
    }),
  });
  if (!res.ok) {
    // Soft-fail — packing should not abort on telemetry
    const text = await res.text().catch(() => "");
    throw new Error(
      `liteparse telemetry failed: ${res.status} ${text.slice(0, 120)}`,
    );
  }
}
