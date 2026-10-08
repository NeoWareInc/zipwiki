import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { zipwikiHomeDir } from "../config/home.js";

const COMM_STATUS = /\b(408|429|500|502|503|504|529)\b/;
const COMM_TEXT =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_|socket hang up|network|fetch failed|other side closed|terminated/i;

/** True for a dropped connection or a retryable HTTP status. Quota and auth are not. */
export function isOkfCommError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  if (code === "okf_fallback_host_llm") return false;
  const status =
    err && typeof err === "object" && "statusCode" in err
      ? Number((err as { statusCode?: unknown }).statusCode)
      : err && typeof err === "object" && "status" in err
        ? Number((err as { status?: unknown }).status)
        : NaN;
  if (status === 408 || status === 429 || status >= 500) return true;
  const message = errorText(err);
  if (COMM_TEXT.test(message)) return true;
  return COMM_STATUS.test(message);
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const extra = err as Error & { cause?: unknown; status?: number; statusCode?: number };
  const cause = extra.cause instanceof Error ? extra.cause.message : "";
  const status = extra.statusCode ?? extra.status;
  return [err.name, err.message, status ? String(status) : "", cause]
    .filter(Boolean)
    .join(" ");
}

export function okfErrorLogPath(): string {
  return join(zipwikiHomeDir(), "okf-errors.log");
}

/** Stderr plus `~/.zipwiki/okf-errors.log`. A log-file failure does not stop the pack. */
export function logOkfError(file: string, err: unknown, retrying: boolean): void {
  const detail = (err instanceof Error ? err.message : String(err))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  const action = retrying ? " — retrying" : "";
  const line = `[zipwiki] error OKF ${file}: ${detail}${action}`;
  console.error(line);
  try {
    const path = okfErrorLogPath();
    mkdirSync(zipwikiHomeDir(), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* the stderr line is the record if the home log cannot be written */
  }
}

const retryDelay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run an OKF model call. A communication error is tried once more.
 * Other failures throw on the first attempt.
 */
export async function withOkfCommRetry<T>(
  file: string,
  run: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = retryDelay,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isOkfCommError(err)) throw err;
    logOkfError(file, err, true);
    await sleep(1000);
    return await run();
  }
}
