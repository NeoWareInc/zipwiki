import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isLlamaCloudConfigured } from "../../config/index.js";
import {
  jobIdFromPayload,
  llamaCreditsFromPayload,
} from "../llama-credits.js";
import { llamaparseEngineVersion } from "../parse-quality.js";
import { resolveParseOcrEnabled } from "../parse-header.js";
import type {
  DocumentParser,
  DocumentParseResult,
  ParseRuntimeOptions,
} from "../types.js";

type LlamaMarkdownPage = {
  markdown?: string;
  page?: number;
  pageNum?: number;
};

type LlamaParseResult = {
  markdown?: {
    pages?: LlamaMarkdownPage[];
  };
  markdown_full?: string | null;
  job?: { id?: string; usage?: { credits?: number | null } };
};

/** Minimal surface we need from `@llamaindex/llama-cloud`. */
export type LlamaCloudClient = {
  parsing: {
    parse: (args: Record<string, unknown>) => Promise<LlamaParseResult>;
  };
};

export type LlamaCloudFactory = () => LlamaCloudClient;

let defaultFactory: LlamaCloudFactory | undefined;

export function setLlamaCloudFactory(
  factory: LlamaCloudFactory | undefined,
): void {
  defaultFactory = factory;
}

async function createDefaultClient(): Promise<LlamaCloudClient> {
  if (defaultFactory) return defaultFactory();
  const mod = await import("@llamaindex/llama-cloud");
  const LlamaCloud = (mod as unknown as { default: new () => LlamaCloudClient })
    .default;
  if (!LlamaCloud) {
    throw new Error(
      "Failed to load @llamaindex/llama-cloud — is it installed?",
    );
  }
  return new LlamaCloud();
}

export class LlamaParseAdapter implements DocumentParser {
  readonly id = "llamaparse" as const;

  constructor(private readonly clientFactory?: LlamaCloudFactory) {}

  async parse(
    path: string,
    opts: ParseRuntimeOptions,
  ): Promise<DocumentParseResult> {
    if (!isLlamaCloudConfigured() && !this.clientFactory && !defaultFactory) {
      throw new Error(
        "LlamaParse requires LLAMA_CLOUD_API_KEY (or an injected LlamaCloud client).",
      );
    }

    const lp = opts.project.parser.llamaparse;
    const client = this.clientFactory
      ? this.clientFactory()
      : await createDefaultClient();

    const expand = Array.from(
      new Set([...(lp.expand.length > 0 ? lp.expand : ["markdown"]), "usage"]),
    );
    const bytes = readFileSync(path);
    const upload_file = new File([bytes], basename(path));
    const ocrWanted = resolveParseOcrEnabled(opts.cli, opts.project);

    const result = await client.parsing.parse({
      tier: lp.tier,
      version: lp.version,
      expand,
      upload_file,
      ...(ocrWanted
        ? {}
        : {
            // Classic LlamaParse job flag; v2 SDK forwards extra body fields.
            disable_ocr: true,
            processing_options: {
              ignore: { ignore_text_in_image: true },
            },
          }),
    });

    const pages = (result.markdown?.pages ?? []).map((p, i) => ({
      pageNum: p.pageNum ?? p.page ?? i + 1,
      markdown: p.markdown ?? "",
      text: p.markdown ?? "",
    }));

    const text =
      (typeof result.markdown_full === "string" && result.markdown_full.trim()
        ? result.markdown_full
        : pages.map((p) => p.markdown).filter(Boolean).join("\n\n")) || "";

    if (!text.trim()) {
      throw new Error(`LlamaParse returned empty markdown for ${path}`);
    }

    let llamaCredits = llamaCreditsFromPayload(result);
    const jobId = jobIdFromPayload(result);
    const apiKey = process.env.LLAMA_CLOUD_API_KEY?.trim();
    if (llamaCredits == null && jobId && apiKey) {
      llamaCredits = await pollLlamaJobCredits(jobId, apiKey);
    }

    const engineVersion = llamaparseEngineVersion();
    return {
      engine: "llamaparse",
      ...(engineVersion ? { engineVersion } : {}),
      text,
      pages: pages.length > 0 ? pages : undefined,
      ...(llamaCredits != null ? { llamaCredits } : {}),
      ...(jobId ? { jobId } : {}),
      raw: result,
    };
  }
}

/** Billing can trail job completion. Poll until LlamaParse records credits. */
async function pollLlamaJobCredits(
  jobId: string,
  apiKey: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(
      `https://api.cloud.llamaindex.ai/api/v2/parse/${jobId}?expand=usage`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (res.ok) {
      const credits = llamaCreditsFromPayload(await res.json());
      if (credits != null) return credits;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  return null;
}
