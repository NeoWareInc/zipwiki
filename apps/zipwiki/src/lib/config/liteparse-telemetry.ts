import {
  reportLiteParseTelemetry,
  reportLlamaParseUsage,
} from "@zipwiki/api-client";
import { stageLog } from "../cli/activity-dots.js";
import {
  isRemoteParseMode,
  resolveParseCredentialSource,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "./api.js";
import { isLlamaCloudConfigured } from "./load.js";

/**
 * LiteParse telemetry when the CLI is connected to ZipWiki and parse is
 * running locally (not via hosted `/api/parse`). Await so pack "done" usage
 * reflects this run.
 */
export async function maybeReportLocalLiteParse(input: {
  success: boolean;
  bytes?: number;
  quiet?: boolean;
  /** Skip when this parse used LlamaParse locally. */
  engine?: string;
}): Promise<void> {
  if (input.engine === "llamaparse") return;
  if (isRemoteParseMode()) return;
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) return;

  try {
    await reportLiteParseTelemetry(url, key, {
      success: input.success,
      bytes: input.bytes,
    });
  } catch (err) {
    if (!input.quiet) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[zipwiki] liteparse telemetry: ${msg}`);
    }
  }
}

let warnedUnbilledLlama = false;

/**
 * Record a LlamaParse job that ran on this machine.
 * Hosted `/api/parse` already records the job against ZipWiki credits.
 * A job that used `LLAMA_CLOUD_API_KEY` is listed separately and is not debited.
 */
export async function maybeReportLlamaParseUsage(input: {
  engine?: string;
  llamaCredits?: number;
  pages?: number;
  bytes?: number;
  filename?: string;
  jobId?: string;
  quiet?: boolean;
}): Promise<void> {
  if (input.engine !== "llamaparse") return;
  if (isRemoteParseMode()) return;
  if (resolveParseCredentialSource() === "zipwiki") return;
  if (!isLlamaCloudConfigured()) return;

  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) {
    if (!warnedUnbilledLlama && !input.quiet) {
      warnedUnbilledLlama = true;
      stageLog(
        "[zipwiki] LlamaParse used your API key. ZipWiki credits were not charged. Sign in to list that usage on the dashboard.",
      );
    }
    return;
  }

  try {
    await reportLlamaParseUsage(url, key, {
      llamaCredits: input.llamaCredits,
      pages: input.pages,
      bytes: input.bytes,
      filename: input.filename,
      jobId: input.jobId,
      userKey: true,
    });
    if (!input.quiet) {
      const llama =
        input.llamaCredits != null
          ? `${input.llamaCredits} Llama credits`
          : "Llama credits pending";
      stageLog(
        `[zipwiki] recorded ${llama} on your LlamaParse key (ZipWiki credits unchanged)`,
      );
    }
  } catch (err) {
    if (!input.quiet) {
      const msg = err instanceof Error ? err.message : String(err);
      stageLog(`[zipwiki] LlamaParse billing: ${msg}`);
    }
  }
}
