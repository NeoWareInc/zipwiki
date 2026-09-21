const LLAMA_BASE = "https://api.cloud.llamaindex.ai";

export type LlamaParseRequest = {
  filename: string;
  bytes: Uint8Array;
  noOcr?: boolean;
};

export type LlamaParseOutput = {
  text: string;
  pageCount: number;
  pages: Array<{ pageNum: number; markdown: string }>;
};

type LlamaJob = { id?: string; status?: string };
type LlamaPage = { page?: number; md?: string; markdown?: string; text?: string };
type LlamaJson = { pages?: LlamaPage[]; markdown?: string };

export async function invokeLlamaParse(
  request: LlamaParseRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<LlamaParseOutput> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([request.bytes]),
    request.filename || "document",
  );
  if (request.noOcr) form.append("disable_ocr", "true");

  const upload = await fetchImpl(`${LLAMA_BASE}/api/parsing/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
  });
  if (!upload.ok) {
    throw new Error(`LlamaParse upload failed (${upload.status})`);
  }
  const job = (await upload.json()) as LlamaJob;
  if (!job.id) throw new Error("LlamaParse did not return a job id");

  let status = job.status ?? "PENDING";
  for (let attempt = 0; attempt < 40 && status !== "SUCCESS"; attempt += 1) {
    if (status === "ERROR" || status === "FAILED" || status === "CANCELLED") {
      throw new Error(`LlamaParse job ${status}`);
    }
    await sleep(1500);
    const polled = await fetchImpl(`${LLAMA_BASE}/api/parsing/job/${job.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!polled.ok) throw new Error(`LlamaParse poll failed (${polled.status})`);
    const body = (await polled.json()) as LlamaJob;
    status = body.status ?? "PENDING";
  }
  if (status !== "SUCCESS") throw new Error("LlamaParse timed out");

  const result = await fetchImpl(
    `${LLAMA_BASE}/api/parsing/job/${job.id}/result/json`,
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
  const json = (await result.json()) as LlamaJson;
  const pages = (json.pages ?? []).map((page, index) => ({
    pageNum: page.page ?? index + 1,
    markdown: page.md ?? page.markdown ?? page.text ?? "",
  }));
  const text =
    pages.map((page) => page.markdown).filter(Boolean).join("\n\n") ||
    json.markdown ||
    "";
  if (!text.trim()) throw new Error("LlamaParse returned empty markdown");
  return { text, pageCount: pages.length, pages };
}
