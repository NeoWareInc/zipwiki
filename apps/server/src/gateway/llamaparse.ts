import { llamaCreditsFromPayload } from "./llama-credits.js";

const LLAMA_BASE = "https://api.cloud.llamaindex.ai";

/** How long to wait for LlamaParse before LiteParse fallback.
 * Official poll payloads only expose coarse job.status (PENDING/RUNNING/…).
 * There is no reliable progress % — so we do not wait beyond 5 minutes. */
export const LLAMA_PARSE_MAX_WAIT_MS = 5 * 60 * 1000;
/** Emit a status line this often while still waiting (reports job.status). */
export const LLAMA_PARSE_PROGRESS_EVERY_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export type LlamaParseWaitOptions = {
  maxWaitMs?: number;
  progressEveryMs?: number;
  pollIntervalMs?: number;
};

export type LlamaParseRequest = {
  filename: string;
  bytes: Uint8Array;
  noOcr?: boolean;
  /** LlamaParse v2 Parse tier (not Extract Turbo). */
  tier?: string;
  version?: string;
};

export type LlamaParseOutput = {
  text: string;
  pageCount: number;
  pages: Array<{ pageNum: number; markdown: string }>;
  /** LlamaParse `job.usage.credits`, once billing has recorded the job. */
  llamaCredits: number | null;
  jobId?: string;
};

export type LlamaParseProgress = {
  jobId: string;
  status: string;
  elapsedSec: number;
  /** 0–100 when the vendor reports it. */
  progress?: number;
  detail?: string;
};

export class LlamaParseTimeoutError extends Error {
  readonly jobId?: string;
  readonly lastStatus: string;
  constructor(message: string, opts: { jobId?: string; lastStatus: string }) {
    super(message);
    this.name = "LlamaParseTimeoutError";
    this.jobId = opts.jobId;
    this.lastStatus = opts.lastStatus;
  }
}

type LlamaJob = {
  id?: string;
  status?: string;
  error_message?: string | null;
  errorMessage?: string | null;
  progress?: number | string | null;
  job?: {
    id?: string;
    status?: string;
    error_message?: string | null;
    progress?: number | string | null;
  };
};

type LlamaPage = { page?: number; md?: string; markdown?: string; text?: string };

function normalizeStatus(raw: string | undefined): string {
  const s = (raw ?? "PENDING").trim().toUpperCase();
  if (s === "COMPLETED") return "SUCCESS";
  if (s === "FAILED") return "ERROR";
  return s || "PENDING";
}

function readProgressPercent(job: LlamaJob): number | undefined {
  // Official LlamaParse GET job docs only guarantee status + error_message.
  // Ignore undocumented progress fields so we never treat them as liveness.
  void job;
  return undefined;
}

function jobDetail(job: LlamaJob): string | undefined {
  const err =
    job.error_message ??
    job.errorMessage ??
    job.job?.error_message ??
    undefined;
  if (typeof err === "string" && err.trim()) return err.trim();
  const pct = readProgressPercent(job);
  if (pct != null) return `${pct}%`;
  return undefined;
}

export async function invokeLlamaParse(
  request: LlamaParseRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  onProgress?: (info: LlamaParseProgress) => void,
  wait?: LlamaParseWaitOptions,
): Promise<LlamaParseOutput> {
  const maxWaitMs = wait?.maxWaitMs ?? LLAMA_PARSE_MAX_WAIT_MS;
  const progressEveryMs =
    wait?.progressEveryMs ?? LLAMA_PARSE_PROGRESS_EVERY_MS;
  const pollIntervalMs = wait?.pollIntervalMs ?? POLL_INTERVAL_MS;

  const tier = (request.tier?.trim() || "cost_effective").toLowerCase();
  const version = request.version?.trim() || "latest";
  // Fast cannot expand markdown — ZipWiki always needs markdown for wiki/parsed/.
  const parseTier =
    tier === "fast" || tier === "turbo" ? "cost_effective" : tier;

  const form = new FormData();
  form.append(
    "file",
    new Blob([request.bytes]),
    request.filename || "document",
  );
  const configuration: Record<string, unknown> = {
    tier: parseTier,
    version,
  };
  if (request.noOcr) {
    configuration.disable_ocr = true;
  }
  form.append("configuration", JSON.stringify(configuration));

  const upload = await fetchImpl(`${LLAMA_BASE}/api/v2/parse/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
  });
  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    throw new Error(
      `LlamaParse upload failed (${upload.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const job = (await upload.json()) as LlamaJob;
  const jobId = job.id ?? job.job?.id;
  if (!jobId) throw new Error("LlamaParse did not return a job id");

  let status = normalizeStatus(job.status ?? job.job?.status);
  const started = Date.now();
  let nextProgressAt = started + progressEveryMs;
  let lastBody: LlamaJob = job;

  while (status !== "SUCCESS") {
    if (status === "ERROR" || status === "FAILED" || status === "CANCELLED") {
      const detail = jobDetail(lastBody);
      throw new Error(
        detail
          ? `LlamaParse job ${status}: ${detail}`
          : `LlamaParse job ${status}`,
      );
    }
    const elapsed = Date.now() - started;
    if (elapsed >= maxWaitMs) {
      throw new LlamaParseTimeoutError(
        `LlamaParse timed out after ${Math.round(elapsed / 1000)}s (last status: ${status})`,
        { jobId, lastStatus: status },
      );
    }

    await sleep(pollIntervalMs);
    const polled = await fetchImpl(
      `${LLAMA_BASE}/api/v2/parse/${jobId}?expand=markdown,usage`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!polled.ok) throw new Error(`LlamaParse poll failed (${polled.status})`);
    lastBody = (await polled.json()) as LlamaJob;
    status = normalizeStatus(lastBody.status ?? lastBody.job?.status);

    const now = Date.now();
    if (onProgress && now >= nextProgressAt) {
      const elapsedSec = Math.round((now - started) / 1000);
      onProgress({
        jobId,
        status,
        elapsedSec,
        progress: readProgressPercent(lastBody),
        detail: jobDetail(lastBody),
      });
      nextProgressAt = now + progressEveryMs;
    }
  }

  // Prefer the last poll body when it already expanded markdown.
  const expanded = lastBody as LlamaJob & {
    markdown?: { pages?: Array<{ page?: number; page_number?: number; markdown?: string }> };
    markdown_full?: string;
    pages?: LlamaPage[];
  };
  let pages: Array<{ pageNum: number; markdown: string }> = [];
  let text = "";
  if (expanded.markdown?.pages?.length) {
    pages = expanded.markdown.pages.map((page, index) => ({
      pageNum: page.page_number ?? page.page ?? index + 1,
      markdown: page.markdown ?? "",
    }));
    text =
      (typeof expanded.markdown_full === "string" && expanded.markdown_full) ||
      pages.map((p) => p.markdown).filter(Boolean).join("\n\n");
  } else {
    const result = await fetchImpl(
      `${LLAMA_BASE}/api/v2/parse/${jobId}?expand=markdown,markdown_full,usage`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!result.ok) {
      throw new Error(`LlamaParse result failed (${result.status})`);
    }
    const json = (await result.json()) as {
      markdown?: {
        pages?: Array<{ page?: number; page_number?: number; markdown?: string }>;
      };
      markdown_full?: string;
      pages?: LlamaPage[];
    };
    pages = (json.markdown?.pages ?? json.pages ?? []).map((page, index) => ({
      pageNum:
        (page as { page_number?: number }).page_number ??
        (page as LlamaPage).page ??
        index + 1,
      markdown:
        (page as { markdown?: string }).markdown ??
        (page as LlamaPage).md ??
        (page as LlamaPage).text ??
        "",
    }));
    text =
      (typeof json.markdown_full === "string" && json.markdown_full.trim()
        ? json.markdown_full
        : pages.map((p) => p.markdown).filter(Boolean).join("\n\n")) || "";
  }

  if (!text.trim()) throw new Error("LlamaParse returned empty markdown");
  const llamaCredits =
    llamaCreditsFromPayload(lastBody) ??
    (await readLlamaJobCredits(jobId, apiKey, fetchImpl, sleep));
  return { text, pageCount: pages.length, pages, llamaCredits, jobId };
}

/** Poll v2 usage until LlamaParse records the credits for this job. */
async function readLlamaJobCredits(
  jobId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<number | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetchImpl(
      `${LLAMA_BASE}/api/v2/parse/${jobId}?expand=usage`,
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
    if (attempt < 3) await sleep(750);
  }
  return null;
}
