import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { withActivityDots, stageLog } from "../../cli/activity-dots.js";
import {
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  type ZipwikiApiConfig,
} from "../../config/index.js";
import { resolveParseOcrEnabled } from "../parse-header.js";
import type { DocumentParseResult, ParseRuntimeOptions } from "../types.js";

export type RemoteParseAdapterOptions = {
  api?: ZipwikiApiConfig;
  fetchImpl?: typeof fetch;
};

/**
 * POST document bytes to ZipWiki parse API (`/api/parse`).
 * Server runs LiteParse / LlamaParse / auto-escalation locally.
 */
export class RemoteParseAdapter {
  private readonly api: ZipwikiApiConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteParseAdapterOptions = {}) {
    this.api = options.api ?? {
      url: resolveZipwikiApiUrl(),
      key: resolveZipwikiApiKey(),
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async parse(
    path: string,
    opts: ParseRuntimeOptions,
  ): Promise<DocumentParseResult> {
    const base = this.api.url?.replace(/\/+$/, "");
    if (!base) {
      throw new Error(
        "ZIPWIKI_API_URL is not set (required for remote parse mode)",
      );
    }

    const bytes = readFileSync(path);
    const filename = basename(path);
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes]),
      filename,
    );

    const { project, cli } = opts;
    if (project.parser.engine) {
      form.append("engine", project.parser.engine);
    }
    if (project.parser.mode) {
      form.append("mode", project.parser.mode);
    }
    if (cli?.maxPages !== undefined) {
      form.append("maxPages", String(cli.maxPages));
    }
    if (cli?.dpi !== undefined) {
      form.append("dpi", String(cli.dpi));
    }
    if (!resolveParseOcrEnabled(cli, project)) {
      form.append("noOcr", "true");
    }

    const headers: Record<string, string> = {};
    if (this.api.key) {
      headers.Authorization = `Bearer ${this.api.key}`;
    }

    return withActivityDots(filename, { quiet: opts.cli?.quiet }, async () => {
      const response = await this.fetchImpl(`${base}/api/parse`, {
        method: "POST",
        headers,
        body: form,
      });

      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(
          `ZipWiki parse API error (${response.status}): ${text.slice(0, 500)}`,
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
        throw new Error(`ZipWiki parse API ${response.status}: ${err}`);
      }

      const parsed = body as DocumentParseResult & {
        forcedEngine?: string;
        fallbackReason?: string;
      };
      if (
        parsed.forcedEngine === "liteparse" ||
        parsed.fallbackReason === "quota_fallback_free" ||
        parsed.fallbackReason === "free_plan"
      ) {
        const why =
          parsed.fallbackReason === "quota_fallback_free"
            ? "LlamaParse quota used; falling back to LiteParse"
            : "Hosted parse unavailable — using LiteParse";
        if (!opts.cli?.quiet) stageLog(`[zipwiki] ${why}`);
        const err = new Error(why);
        (err as Error & { code?: string }).code =
          parsed.fallbackReason === "free_plan"
            ? "free_plan"
            : "quota_fallback_free";
        throw err;
      }

      return parsed;
    });
  }
}
