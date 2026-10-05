import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createConvexGateway } from "./convex.js";
import type { QueryTranscriptTurn } from "./anthropic.js";
import {
  handleOkf,
  handleParse,
  handleQueryAnswer,
  type GatewayDeps,
  type QueryExcerptInput,
} from "./handle.js";

function bearer(header: string | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

function headerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

/** Fail closed. A missing worker secret does not open the model route. */
function workerSecretMatches(got: string, expected: string | undefined): boolean {
  const want = expected?.trim() ?? "";
  if (!want || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(want);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function gatewayDeps(overrides?: Partial<GatewayDeps>): GatewayDeps {
  return {
    convex: overrides?.convex ?? createConvexGateway(),
    fetchImpl: overrides?.fetchImpl,
    env: overrides?.env,
    sleep: overrides?.sleep,
  };
}

export async function registerGateway(
  app: FastifyInstance,
  deps: GatewayDeps,
): Promise<void> {
  app.get("/api/client-config", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    try {
      const config = await deps.convex.getClientConfig(token);
      return reply.code(200).send(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : "client_config_failed";
      if (message === "unauthorized") {
        return reply.code(401).send({ error: "unauthorized" });
      }
      return reply.code(502).send({ error: message });
    }
  });

  app.get("/api/settings", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    try {
      const settings = await deps.convex.getAccountSettings(validated.accountId);
      return reply.code(200).send({
        ...settings,
        accountId: validated.accountId,
        ...(validated.email ? { email: validated.email } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "settings_get_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.put("/api/settings", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    const markSetupComplete =
      (body as { markSetupComplete?: unknown }).markSetupComplete === true;
    const { markSetupComplete: _m, ...settings } = body as Record<
      string,
      unknown
    >;
    try {
      const saved = await deps.convex.putAccountSettings({
        accountId: validated.accountId,
        settings,
        markSetupComplete,
      });
      return reply.code(200).send(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "settings_put_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/telemetry/liteparse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const success = (body as { success?: unknown }).success;
    const bytes = (body as { bytes?: unknown }).bytes;
    if (typeof success !== "boolean") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    const createIdRaw = (body as { createId?: unknown }).createId;
    const createIdAlt = (body as { create_id?: unknown }).create_id;
    const createId =
      typeof createIdRaw === "string" && createIdRaw.trim()
        ? createIdRaw.trim().slice(0, 128)
        : typeof createIdAlt === "string" && createIdAlt.trim()
          ? createIdAlt.trim().slice(0, 128)
          : undefined;
    try {
      await deps.convex.recordLiteparse({
        accountId: validated.accountId,
        success,
        ...(typeof bytes === "number" ? { bytes } : {}),
        ...(createId ? { createId } : {}),
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "liteparse_record_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/telemetry/activity", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const type = (body as { type?: unknown }).type;
    if (
      type !== "pack" &&
      type !== "pack_start" &&
      type !== "pack_end" &&
      type !== "query"
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const engine = (body as { engine?: unknown }).engine;
    const status = (body as { status?: unknown }).status;
    const filename = (body as { filename?: unknown }).filename;
    const bytes = (body as { bytes?: unknown }).bytes;
    const pages = (body as { pages?: unknown }).pages;
    const createIdRaw = (body as { createId?: unknown }).createId;
    const createIdAlt = (body as { create_id?: unknown }).create_id;
    const createId =
      typeof createIdRaw === "string" && createIdRaw.trim()
        ? createIdRaw.trim().slice(0, 128)
        : typeof createIdAlt === "string" && createIdAlt.trim()
          ? createIdAlt.trim().slice(0, 128)
          : undefined;
    const creditCost = (body as { creditCost?: unknown }).creditCost;
    const creditCostAlt = (body as { credit_cost?: unknown }).credit_cost;
    const llamaCredits = (body as { llamaCredits?: unknown }).llamaCredits;
    const llamaCreditsAlt = (body as { llama_credits?: unknown }).llama_credits;
    const inputTokens = (body as { inputTokens?: unknown }).inputTokens;
    const inputTokensAlt = (body as { input_tokens?: unknown }).input_tokens;
    const outputTokens = (body as { outputTokens?: unknown }).outputTokens;
    const outputTokensAlt = (body as { output_tokens?: unknown }).output_tokens;
    const okfCount = (body as { okfCount?: unknown }).okfCount;
    const okfCountAlt = (body as { okf_count?: unknown }).okf_count;
    const parseCount = (body as { parseCount?: unknown }).parseCount;
    const parseCountAlt = (body as { parse_count?: unknown }).parse_count;
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const pickNum = (a: unknown, b: unknown) => num(a) ?? num(b);
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    try {
      const creditCostN = pickNum(creditCost, creditCostAlt);
      const llamaCreditsN = pickNum(llamaCredits, llamaCreditsAlt);
      const inputTokensN = pickNum(inputTokens, inputTokensAlt);
      const outputTokensN = pickNum(outputTokens, outputTokensAlt);
      const okfCountN = pickNum(okfCount, okfCountAlt);
      const parseCountN = pickNum(parseCount, parseCountAlt);
      await deps.convex.recordActivity({
        accountId: validated.accountId,
        type,
        ...(typeof engine === "string" ? { engine } : {}),
        ...(typeof status === "string" ? { status } : {}),
        ...(typeof filename === "string" ? { filename } : {}),
        ...(typeof bytes === "number" ? { bytes } : {}),
        ...(typeof pages === "number" ? { pages } : {}),
        ...(createId ? { createId } : {}),
        ...(creditCostN != null ? { creditCost: creditCostN } : {}),
        ...(llamaCreditsN != null ? { llamaCredits: llamaCreditsN } : {}),
        ...(inputTokensN != null ? { inputTokens: inputTokensN } : {}),
        ...(outputTokensN != null ? { outputTokens: outputTokensN } : {}),
        ...(okfCountN != null ? { okfCount: okfCountN } : {}),
        ...(parseCountN != null ? { parseCount: parseCountN } : {}),
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "activity_record_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/parse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file required" });
    const bytes = await file.toBuffer();
    const fields = file.fields;
    const noOcr = readField(fields, "noOcr") === "true";
    const tier = readField(fields, "tier") || undefined;
    const version = readField(fields, "version") || undefined;
    const createId =
      readField(fields, "createId") ||
      readField(fields, "create_id") ||
      undefined;
    const stream =
      (req.query as { stream?: string }).stream === "1" ||
      String(req.headers.accept ?? "").includes("application/x-ndjson");

    if (!stream) {
      const result = await handleParse(deps, {
        token,
        filename: file.filename,
        bytes,
        noOcr,
        tier,
        version,
        ...(createId ? { createId } : {}),
      });
      return reply.code(result.status).send(result.body);
    }

    // NDJSON: progress lines keep the connection alive past Fly/proxy idle limits,
    // then a final result / fallback / error event.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    const writeLine = (obj: Record<string, unknown>) => {
      raw.write(`${JSON.stringify(obj)}\n`);
    };
    try {
      const result = await handleParse(deps, {
        token,
        filename: file.filename,
        bytes,
        noOcr,
        tier,
        version,
        ...(createId ? { createId } : {}),
        onProgress: (info) => {
          writeLine({
            event: "progress",
            filename: file.filename,
            jobId: info.jobId,
            status: info.status,
            elapsedSec: info.elapsedSec,
            ...(info.progress != null ? { progress: info.progress } : {}),
            ...(info.detail ? { detail: info.detail } : {}),
          });
        },
      });
      if (result.status >= 400) {
        writeLine({
          event: "error",
          status: result.status,
          ...(typeof result.body === "object" && result.body !== null
            ? (result.body as Record<string, unknown>)
            : { error: String(result.body) }),
        });
      } else {
        writeLine({
          event: "result",
          ...(typeof result.body === "object" && result.body !== null
            ? (result.body as Record<string, unknown>)
            : { body: result.body }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "parse_failed";
      writeLine({ event: "error", status: 502, error: message });
    }
    raw.end();
  });

  app.post("/api/usage/llamaparse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const llamaCredits = (body as { llamaCredits?: unknown }).llamaCredits;
    const pages = (body as { pages?: unknown }).pages;
    const bytes = (body as { bytes?: unknown }).bytes;
    const filename = (body as { filename?: unknown }).filename;
    const jobId = (body as { jobId?: unknown }).jobId;
    const userKey = (body as { userKey?: unknown }).userKey === true;
    const createIdRaw = (body as { createId?: unknown }).createId;
    const createIdAlt = (body as { create_id?: unknown }).create_id;
    const createId =
      typeof createIdRaw === "string" && createIdRaw.trim()
        ? createIdRaw.trim().slice(0, 128)
        : typeof createIdAlt === "string" && createIdAlt.trim()
          ? createIdAlt.trim().slice(0, 128)
          : undefined;
    let validated;
    try {
      validated = await deps.convex.validateKey(token, "parse");
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    if (!userKey && (!validated.billable || validated.fallback)) {
      return reply.code(402).send({ error: "quota_fallback_free" });
    }
    try {
      const recorded = await deps.convex.recordUsage({
        accountId: validated.accountId,
        kind: "parse",
        billable: !userKey,
        userKey,
        usage: {
          provider: "llamaparse",
          engine: "llamaparse",
          ...(typeof pages === "number" ? { pages } : {}),
          ...(typeof bytes === "number" ? { bytes } : {}),
          ...(typeof llamaCredits === "number" ? { llamaCredits } : {}),
          ...(typeof filename === "string" && filename.trim()
            ? { filename: filename.trim().slice(0, 512) }
            : {}),
          ...(typeof jobId === "string" && jobId.trim()
            ? { jobId: jobId.trim().slice(0, 128) }
            : {}),
          ...(createId ? { createId } : {}),
        },
      });
      return reply.code(200).send({ ok: true, ...recorded });
    } catch (err) {
      const message = err instanceof Error ? err.message : "record_usage_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/okf/enrich", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const raw = body as Record<string, unknown>;
    const model = typeof raw.model === "string" ? raw.model : undefined;
    const createId =
      typeof raw.createId === "string" && raw.createId.trim()
        ? raw.createId.trim().slice(0, 128)
        : typeof raw.create_id === "string" && raw.create_id.trim()
          ? raw.create_id.trim().slice(0, 128)
          : undefined;
    const result = await handleOkf(deps, {
      token,
      model,
      ...(createId ? { createId } : {}),
      input: {
        primaries: raw.primaries as
          | Array<{ path?: string; documentType?: string }>
          | undefined,
        parsedMarkdown:
          typeof raw.parsedMarkdown === "string"
            ? raw.parsedMarkdown
            : undefined,
        title: typeof raw.title === "string" ? raw.title : undefined,
        digest: typeof raw.digest === "string" ? raw.digest : undefined,
        documentType:
          typeof raw.documentType === "string" ? raw.documentType : undefined,
        okfProfile:
          typeof raw.okfProfile === "string" ? raw.okfProfile : undefined,
      },
    });
    return reply.code(result.status).send(result.body);
  });

  app.post("/api/query/answer", async (req, reply) => {
    const env = deps.env ?? process.env;
    const secret = headerText(req.headers["x-zipwiki-worker-secret"]);
    const worker = workerSecretMatches(secret, env.ZIPWIKI_WORKER_SECRET);
    const token = bearer(headerText(req.headers.authorization));
    if (!worker && !token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const raw = body as Record<string, unknown>;
    const question = typeof raw.question === "string" ? raw.question : "";
    const excerpts = parseQueryExcerpts(raw.excerpts);
    const transcript = parseQueryTranscript(raw.transcript);
    const finish = raw.finish === true;
    const filename =
      typeof raw.filename === "string" ? raw.filename.trim().slice(0, 512) : undefined;

    let accountId: string | undefined;
    if (!worker) {
      let billing;
      try {
        billing = await deps.convex.queryBilling(token);
      } catch {
        return reply.code(503).send({ error: "convex_unavailable" });
      }
      if (!billing.ok) {
        return reply.code(billing.status).send({ error: billing.error });
      }
      if (billing.disabled) {
        return reply.code(403).send({ error: "account_disabled" });
      }
      if (billing.creditsLocked) {
        return reply.code(403).send({ error: "credits_locked" });
      }
      if (!billing.creditsUnlimited && billing.creditsRemaining < 1) {
        return reply.code(402).send({ error: "credits_exhausted" });
      }
      accountId = billing.accountId;
    }

    const result = await handleQueryAnswer(deps, {
      question,
      excerpts,
      transcript,
      finish,
    });
    if (result.status !== 200 || !accountId) {
      return reply.code(result.status).send(result.body);
    }
    const turn = result.body as {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    };
    try {
      const billed = await deps.convex.recordQuery({
        accountId,
        model: turn.model ?? "claude-haiku-4-5",
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        filename,
      });
      return reply.code(200).send({ ...result.body as object, ...billed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "record_query_failed";
      return reply.code(502).send({ error: message });
    }
  });
}

function parseQueryExcerpts(value: unknown): QueryExcerptInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): QueryExcerptInput[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const path = typeof row.path === "string" ? row.path : "";
    const text = typeof row.text === "string" ? row.text : "";
    const kind =
      row.kind === "parsed" ? "parsed" : row.kind === "gap" ? "gap" : row.kind === "okf" ? "okf" : null;
    if (!path || !kind) return [];
    const documents = Array.isArray(row.documents)
      ? row.documents.filter((entry): entry is string => typeof entry === "string")
      : [];
    return [
      {
        path,
        text,
        kind,
        ...(typeof row.title === "string" ? { title: row.title } : {}),
        ...(documents.length > 0 ? { documents } : {}),
      },
    ];
  });
}

function parseQueryTranscript(value: unknown): QueryTranscriptTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: QueryTranscriptTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.role === "assistant" && Array.isArray(row.content)) {
      turns.push({ role: "assistant", content: row.content });
      continue;
    }
    if (row.role !== "user" || !Array.isArray(row.results)) continue;
    const results = row.results.flatMap((result) => {
      if (!result || typeof result !== "object") return [];
      const read = result as Record<string, unknown>;
      const id = typeof read.id === "string" ? read.id : "";
      const path = typeof read.path === "string" ? read.path : "";
      if (!id || !path) return [];
      return [
        {
          id,
          path,
          ...(typeof read.text === "string" ? { text: read.text } : {}),
          ...(typeof read.error === "string" ? { error: read.error } : {}),
        },
      ];
    });
    turns.push({ role: "user", results });
  }
  return turns;
}

function readField(
  fields: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const field = fields?.[name];
  if (!field || typeof field !== "object") return undefined;
  if ("value" in field && typeof field.value === "string") return field.value;
  return undefined;
}
