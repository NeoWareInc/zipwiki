import {
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  type ZipwikiApiConfig,
} from "../../config/index.js";
import { getCreateId } from "../../config/create-session.js";
import { resolveOkfProfile, sampleFor } from "../profiles.js";
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

    const profile = resolveOkfProfile({
      explicit: input.okfProfile,
      fileName: input.primaries[0]?.path,
    });
    const createId = getCreateId();
    const response = await this.fetchImpl(`${base}/api/okf/enrich`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        primaries: input.primaries,
        parsedMarkdown: sampleFor(profile, input.parsedMarkdown),
        title: input.title,
        digest: input.digest,
        documentType: input.documentType,
        okfProfile: profile,
        ...(input.model?.trim() ? { model: input.model.trim() } : {}),
        ...(createId ? { createId } : {}),
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

  /** One package summary from concept titles and descriptions. */
  async digest(input: {
    count: number;
    catalog: string;
    bodyBudget: number;
  }): Promise<string> {
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
    const createId = getCreateId();
    const response = await this.fetchImpl(`${base}/api/okf/digest`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        catalog: input.catalog,
        count: input.count,
        bodyBudget: input.bodyBudget,
        ...(createId ? { createId } : {}),
      }),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        `ZipWiki OKF digest API error (${response.status}): ${text.slice(0, 500)}`,
      );
    }
    if (!response.ok) {
      const err =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : text.slice(0, 500);
      const error = new Error(`ZipWiki OKF digest API ${response.status}: ${err}`);
      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        typeof (body as { code: unknown }).code === "string"
      ) {
        (error as Error & { code?: string }).code = (body as { code: string }).code;
      }
      throw error;
    }
    const summary =
      typeof body === "object" &&
      body !== null &&
      "summary" in body &&
      typeof (body as { summary: unknown }).summary === "string"
        ? (body as { summary: string }).summary.trim()
        : "";
    if (!summary) throw new Error("ZipWiki OKF digest API returned an empty summary");
    return summary;
  }
}
