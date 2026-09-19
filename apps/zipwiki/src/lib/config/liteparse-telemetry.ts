import { reportLiteParseTelemetry } from "@zipwiki/api-client";
import {
  isRemoteParseMode,
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
