import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { withActivityDots, stageLog } from "../../cli/activity-dots.js";
import {
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  type ZipwikiApiConfig,
} from "../../config/index.js";
import { getCreateId } from "../../config/create-session.js";
import { resolveParseOcrEnabled } from "../parse-header.js";
import type { DocumentParseResult, ParseRuntimeOptions } from "../types.js";

export type RemoteParseAdapterOptions = {
  api?: ZipwikiApiConfig;
  fetchImpl?: typeof fetch;
};

type NdjsonEvent = {
  event?: string;
  status?: string | number;
  error?: string;
  engine?: string;
  text?: string;
  pages?: DocumentParseResult["pages"];
  forcedEngine?: string;
  fallbackReason?: string;
  filename?: string;
  jobId?: string;
  elapsedSec?: number;
  progress?: number;
  detail?: string;
  lastStatus?: string;
};

function formatProgressLine(ev: NdjsonEvent, filename: string): string {
  const name = ev.filename || filename;
  const parts = [
    `LlamaParse still running for ${name}`,
    `${ev.elapsedSec ?? "?"}s`,
    `status=${ev.status ?? "PENDING"}`,
  ];
  if (ev.detail) parts.push(ev.detail);
  if (ev.jobId) parts.push(`job=${ev.jobId}`);
  return parts.join(" · ");
}

async function readResponseBody(response: Response): Promise<string> {
  return response.text();
}

function parseBodyEvents(text: string): NdjsonEvent[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Plain JSON object (non-stream / older gateway).
  if (trimmed.startsWith("{") && !trimmed.includes("\n")) {
    return [JSON.parse(trimmed) as NdjsonEvent];
  }
  const events: NdjsonEvent[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    events.push(JSON.parse(row) as NdjsonEvent);
  }
  return events;
}

/**
 * POST document bytes to ZipWiki parse API (`/api/parse?stream=1`).
 * Server runs LlamaParse (with progress lines) or signals LiteParse fallback.
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
    if (project.parser.llamaparse?.tier) {
      form.append("tier", project.parser.llamaparse.tier);
    }
    if (project.parser.llamaparse?.version) {
      form.append("version", project.parser.llamaparse.version);
    }
    if (!resolveParseOcrEnabled(cli, project)) {
      form.append("noOcr", "true");
    }
    const createId = getCreateId();
    if (createId) {
      form.append("createId", createId);
    }

    const headers: Record<string, string> = {
      Accept: "application/x-ndjson, application/json",
    };
    if (this.api.key) {
      headers.Authorization = `Bearer ${this.api.key}`;
    }

    return withActivityDots(filename, { quiet: opts.cli?.quiet }, async () => {
      const response = await this.fetchImpl(`${base}/api/parse?stream=1`, {
        method: "POST",
        headers,
        body: form,
      });

      const text = await readResponseBody(response);
      let events: NdjsonEvent[];
      try {
        events = parseBodyEvents(text);
      } catch {
        throw new Error(
          `ZipWiki parse API error (${response.status}): ${text.slice(0, 500)}`,
        );
      }

      if (events.length === 0) {
        throw new Error(
          `ZipWiki parse API error (${response.status}): empty body`,
        );
      }

      for (const ev of events) {
        if (ev.event === "progress") {
          if (!opts.cli?.quiet) {
            stageLog(`[zipwiki] ${formatProgressLine(ev, filename)}`);
          }
          continue;
        }
        if (ev.event === "error") {
          const err =
            typeof ev.error === "string" ? ev.error : text.slice(0, 500);
          const status =
            typeof ev.status === "number" ? ev.status : response.status;
          throw new Error(`ZipWiki parse API ${status}: ${err}`);
        }
      }

      const last = events[events.length - 1]!;
      const body =
        last.event === "result"
          ? last
          : last.event
            ? last
            : last;

      // Non-stream JSON error responses.
      if (!response.ok && body.event !== "result") {
        const err =
          typeof body.error === "string" ? body.error : text.slice(0, 500);
        throw new Error(`ZipWiki parse API ${response.status}: ${err}`);
      }

      const parsed = body as DocumentParseResult & {
        forcedEngine?: string;
        fallbackReason?: string;
        error?: string;
        lastStatus?: string;
      };

      if (
        parsed.forcedEngine === "liteparse" ||
        parsed.fallbackReason === "quota_fallback_free" ||
        parsed.fallbackReason === "free_plan" ||
        parsed.fallbackReason === "llamaparse_timeout"
      ) {
        const why =
          parsed.fallbackReason === "llamaparse_timeout"
            ? `LlamaParse timed out${parsed.lastStatus ? ` (last status: ${parsed.lastStatus})` : ""}; falling back to LiteParse`
            : parsed.fallbackReason === "quota_fallback_free"
              ? "LlamaParse quota used; falling back to LiteParse"
              : "Hosted parse unavailable — using LiteParse";
        if (!opts.cli?.quiet) stageLog(`[zipwiki] ${why}`);
        const err = new Error(why);
        (err as Error & { code?: string }).code =
          parsed.fallbackReason === "llamaparse_timeout"
            ? "llamaparse_timeout"
            : parsed.fallbackReason === "free_plan"
              ? "free_plan"
              : "quota_fallback_free";
        throw err;
      }

      if (body.event === "error") {
        throw new Error(
          `ZipWiki parse API ${body.status ?? response.status}: ${body.error ?? "parse_failed"}`,
        );
      }

      return {
        engine: (parsed.engine as DocumentParseResult["engine"]) ?? "llamaparse",
        text: parsed.text ?? "",
        ...(parsed.pages ? { pages: parsed.pages } : {}),
      };
    });
  }
}
