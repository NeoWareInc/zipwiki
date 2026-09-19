import {
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  type ZipwikiApiConfig,
} from "../../config/index.js";
import type { BuildOkfBundleInput, OkfEnrichment } from "../types.js";

export type RemoteOkfAdapterOptions = {
  api?: ZipwikiApiConfig;
  fetchImpl?: typeof fetch;
};

/**
 * POST OKF enrichment to ZipWiki API (`/api/okf/enrich`).
 */
export class RemoteOkfAdapter {
  private readonly api: ZipwikiApiConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteOkfAdapterOptions = {}) {
    this.api = options.api ?? {
      url: resolveZipwikiApiUrl(),
      key: resolveZipwikiApiKey(),
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async enrich(input: BuildOkfBundleInput): Promise<OkfEnrichment> {
    const base = this.api.url?.replace(/\/+$/, "");
    if (!base) {
      throw new Error(
        "ZIPWIKI_API_URL is not set (required for remote OKF mode)",
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.api.key) {
      headers.Authorization = `Bearer ${this.api.key}`;
    }

    const response = await this.fetchImpl(`${base}/api/okf/enrich`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        primaries: input.primaries,
        parsedMarkdown: input.parsedMarkdown,
        title: input.title,
        digest: input.digest,
        documentType: input.documentType,
      }),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        `ZipWiki OKF API error (${response.status}): ${text.slice(0, 500)}`,
      );
    }

    if (!response.ok) {
      const code =
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        typeof (body as { code: unknown }).code === "string"
          ? (body as { code: string }).code
          : typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : null;
      if (code === "okf_fallback_host_llm") {
        const err = new Error(
          "ZipWiki OKF unavailable (free plan or quota exhausted). Use host-LLM enrichment via okf_enrich / MCP.",
        );
        (err as Error & { code?: string }).code = "okf_fallback_host_llm";
        throw err;
      }
      const err =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : text.slice(0, 500);
      throw new Error(`ZipWiki OKF API ${response.status}: ${err}`);
    }

    return body as OkfEnrichment;
  }
}
