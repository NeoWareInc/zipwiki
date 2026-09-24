import {
  reportLiteParseTelemetry,
  reportLlamaParseUsage,
} from "@zipwiki/api-client";
import {
  isRemoteParseMode,
  resolveParseCredentialSource,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "./api.js";

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
 * Debit the signed-in account for a LlamaParse job that ran on this machine.
 * Hosted `/api/parse` already records the job. A bring-your-own Llama key is
 * billed by LlamaParse, not ZipWiki.
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
  if (resolveParseCredentialSource() === "llama") return;

  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) {
    if (!warnedUnbilledLlama && !input.quiet) {
      warnedUnbilledLlama = true;
      console.error(
        "[zipwiki] LlamaParse was not charged to an account. Run `zipwiki auth login` so each job's Llama credits are deducted.",
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
    });
    if (!input.quiet) {
      const llama =
        input.llamaCredits != null
          ? `${input.llamaCredits} Llama credits`
          : "Llama credits pending";
      console.error(`[zipwiki] billed ${llama}`);
    }
  } catch (err) {
    if (!input.quiet) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[zipwiki] LlamaParse billing: ${msg}`);
    }
  }
}
