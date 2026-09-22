import { apiFetch } from "./client-config.js";

/** Report one local LlamaParse job so ZipWiki can debit that account. */
export async function reportLlamaParseUsage(
  baseUrl: string,
  apiKey: string,
  input: { llamaCredits?: number; pages?: number; bytes?: number },
): Promise<void> {
  const res = await apiFetch(baseUrl, "/api/usage/llamaparse", {
    method: "POST",
    apiKey,
    body: JSON.stringify({
      llamaCredits: input.llamaCredits,
      pages: input.pages,
      bytes: input.bytes,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `LlamaParse usage report failed: ${res.status} ${text.slice(0, 160)}`,
    );
  }
}
